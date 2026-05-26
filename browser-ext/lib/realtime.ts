import { SupabaseClient, Session, RealtimeChannel } from '@supabase/supabase-js'
import { SyncService, RemotePrompt } from './sync'

export type RealtimeState =
  | { kind: 'connecting' }
  | { kind: 'catching_up' }
  | { kind: 'live' }
  | { kind: 'reconnecting'; attempt: number }
  | { kind: 'error'; message: string }
  | { kind: 'closed' }

export interface RealtimeEvent {
  op: 'insert' | 'update' | 'delete'
  id: string
}

export interface RealtimeSyncOptions {
  supabase: SupabaseClient
  backendUrl: string
  accessToken: string
  refreshToken: string | null
  userId: string
  lastSyncTime: string | null
  onEvent: (e: RealtimeEvent) => void
  onStateChange: (s: RealtimeState) => void
  onTokenRefreshed: (s: Session) => void
}

// Exponential backoff: 1s → 2s → 5s → 15s → 60s (cap)
const BACKOFF_DELAYS_MS = [1_000, 2_000, 5_000, 15_000, 60_000]

export class RealtimeSyncService {
  private readonly opts: RealtimeSyncOptions
  private channel: RealtimeChannel | null = null
  private stopped = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private onlineHandler: (() => void) | null = null

  // Tokens may be refreshed mid-life; track them separately to avoid mutating opts
  private currentAccessToken: string
  private currentRefreshToken: string | null

  // Echo suppression: id → { updatedAt, expiresAt }
  private readonly outbound = new Map<string, { updatedAt: string; expiresAt: number }>()

  // Buffer events that arrive while catch-up is running
  private catchingUp = false
  private buffer: Array<{ op: 'insert' | 'update' | 'delete'; record: RemotePrompt }> = []

  constructor(opts: RealtimeSyncOptions) {
    this.opts = opts
    this.currentAccessToken = opts.accessToken
    this.currentRefreshToken = opts.refreshToken
  }

  /**
   * Reserved for a future foreground-write echo-suppression optimisation; not
   * currently wired — the service relies on LWW idempotence for echo handling.
   */
  markOutbound(id: string, updatedAt: string): void {
    this.outbound.set(id, { updatedAt, expiresAt: Date.now() + 30_000 })
  }

  async start(): Promise<void> {
    this.stopped = false
    await this._connect()
  }

  async stop(): Promise<void> {
    this.stopped = true
    this._clearReconnectTimer()
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler)
      this.onlineHandler = null
    }
    if (this.channel) {
      await this.opts.supabase.removeChannel(this.channel)
      this.channel = null
    }
    this.opts.onStateChange({ kind: 'closed' })
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async _connect(): Promise<void> {
    if (this.stopped) return

    this.opts.onStateChange({ kind: 'connecting' })
    this.catchingUp = true
    this.buffer = []

    const { supabase, userId } = this.opts

    this.channel = supabase
      .channel(`prompts:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prompts',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => this._handlePayload(payload as unknown as RealtimePayload),
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this._runCatchUp()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          await this._handleChannelError()
        } else if (status === 'CLOSED' && !this.stopped) {
          this._scheduleReconnect()
        }
      })
  }

  private _handlePayload(payload: RealtimePayload): void {
    const eventType = payload.eventType
    // For DELETE, old has the row; for INSERT/UPDATE, new has it.
    const record = (eventType === 'DELETE' ? payload.old : payload.new) as unknown as RemotePrompt
    if (!record?.id) return

    const op = eventType === 'INSERT' ? 'insert' : eventType === 'UPDATE' ? 'update' : 'delete'

    if (this.catchingUp) {
      this.buffer.push({ op, record })
      return
    }

    void this._applyEvent(op, record, eventType === 'DELETE')
  }

  private async _applyEvent(
    op: 'insert' | 'update' | 'delete',
    record: RemotePrompt,
    isHardDelete: boolean,
  ): Promise<void> {
    // Echo suppression: drop events we generated ourselves
    const pending = this._consumeEcho(record.id)
    if (pending !== null && pending === record.updated_at) return

    const svc = this._makeSyncService()
    try {
      if (isHardDelete) {
        await svc.applyHardDelete(record.id)
        this.opts.onEvent({ op, id: record.id })
      } else {
        const outcome = await svc.applyRemoteEvent(record)
        if (outcome !== 'skipped') {
          this.opts.onEvent({ op, id: record.id })
        }
      }
    } catch {
      // Non-fatal: the next catch-up or reconciliation alarm will heal it
    }
  }

  private _consumeEcho(id: string): string | null {
    const entry = this.outbound.get(id)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.outbound.delete(id)
      return null
    }
    return entry.updatedAt
  }

  private async _runCatchUp(): Promise<void> {
    this.opts.onStateChange({ kind: 'catching_up' })

    try {
      const svc = this._makeSyncService()
      await svc.catchUpSince(this.opts.lastSyncTime)
    } catch {
      // Partial catch-up: go live anyway; buffer drain + next alarm will heal
    }

    // Drain buffered events (all idempotent via LWW inside applyRemoteEvent)
    this.catchingUp = false
    const buffered = this.buffer.splice(0)
    for (const { op, record } of buffered) {
      await this._applyEvent(op, record, op === 'delete')
    }

    this.reconnectAttempt = 0
    this.opts.onStateChange({ kind: 'live' })
  }

  private async _handleChannelError(): Promise<void> {
    // Attempt a token refresh before falling back to reconnect backoff
    if (this.currentRefreshToken) {
      try {
        const { data, error } = await this.opts.supabase.auth.refreshSession({
          refresh_token: this.currentRefreshToken,
        })
        if (!error && data.session) {
          this.currentAccessToken = data.session.access_token
          this.currentRefreshToken = data.session.refresh_token
          this.opts.onTokenRefreshed(data.session)

          if (this.channel) {
            await this.opts.supabase.removeChannel(this.channel)
            this.channel = null
          }
          await this._connect()
          return
        }
      } catch {
        // Fall through to reconnect
      }
    }
    this._scheduleReconnect()
  }

  private _scheduleReconnect(): void {
    if (this.stopped) return

    const delay =
      BACKOFF_DELAYS_MS[Math.min(this.reconnectAttempt, BACKOFF_DELAYS_MS.length - 1)]
    this.reconnectAttempt++
    this.opts.onStateChange({ kind: 'reconnecting', attempt: this.reconnectAttempt })

    let fired = false
    const doReconnect = () => {
      if (fired) return
      fired = true
      this._clearReconnectTimer()
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler)
        this.onlineHandler = null
      }
      void this._connect()
    }

    this.onlineHandler = doReconnect
    window.addEventListener('online', this.onlineHandler, { once: true })
    this.reconnectTimer = setTimeout(doReconnect, delay)
  }

  private _clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private _makeSyncService(): SyncService {
    return new SyncService(
      this.opts.backendUrl,
      this.opts.supabase,
      this.currentAccessToken,
      this.opts.userId,
    )
  }
}

// Internal shape of a postgres_changes payload from Supabase Realtime
interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
  errors: string[] | null
}
