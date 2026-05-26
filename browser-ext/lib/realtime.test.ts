import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RealtimeSyncService } from './realtime'
import type { RealtimeSyncOptions, RealtimeState } from './realtime'
import { SyncService } from './sync'
import type { RemotePrompt, SyncResult } from './sync'
import type { SupabaseClient, Session } from '@supabase/supabase-js'

vi.mock('./sync', () => ({ SyncService: vi.fn() }))

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-123'
const BACKEND = 'http://localhost:8000'
const ACCESS_TOKEN = 'access-tok'
const REFRESH_TOKEN = 'refresh-tok'
const LAST_SYNC = '2026-01-01T00:00:00.000Z'

// ── Channel mock ──────────────────────────────────────────────────────────────

interface ChannelHandle {
  firePayload(payload: unknown): void
  fireStatus(status: string): Promise<void>
  onFn: ReturnType<typeof vi.fn>
  subscribeFn: ReturnType<typeof vi.fn>
}

function makeChannelMock(): { channel: Record<string, unknown>; handle: ChannelHandle } {
  // Mutable refs so reconnects (multiple _connect calls) update the captured handlers
  let payloadHandler = (_p: unknown) => {}
  let subscribeCb: (status: string) => Promise<void> = async () => {}

  const channel: Record<string, unknown> = {}
  channel['on'] = vi.fn().mockImplementation(
    (_type: string, _filter: unknown, h: typeof payloadHandler) => {
      payloadHandler = h
      return channel
    },
  )
  channel['subscribe'] = vi.fn().mockImplementation((cb: typeof subscribeCb) => {
    subscribeCb = cb
    return channel
  })

  const handle: ChannelHandle = {
    firePayload: (p) => payloadHandler(p),
    fireStatus: (s) => subscribeCb(s),
    onFn: channel['on'] as ReturnType<typeof vi.fn>,
    subscribeFn: channel['subscribe'] as ReturnType<typeof vi.fn>,
  }

  return { channel, handle }
}

// ── Supabase mock ─────────────────────────────────────────────────────────────

type SupabaseMock = SupabaseClient & {
  channel: ReturnType<typeof vi.fn>
  removeChannel: ReturnType<typeof vi.fn>
  auth: { refreshSession: ReturnType<typeof vi.fn> }
}

function makeSupabaseMock(channel: Record<string, unknown>): SupabaseMock {
  return {
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    auth: { refreshSession: vi.fn() },
  } as unknown as SupabaseMock
}

// ── SyncService mock ──────────────────────────────────────────────────────────

type SyncMocks = {
  catchUpSince: ReturnType<typeof vi.fn>
  applyRemoteEvent: ReturnType<typeof vi.fn>
  applyHardDelete: ReturnType<typeof vi.fn>
  performSync: ReturnType<typeof vi.fn>
}

function makeSyncMock(overrides: Partial<SyncMocks> = {}): SyncMocks {
  const defaultResult: SyncResult = { pushed: 0, pulled: 0, deleted: 0, errors: [] }
  const mocks: SyncMocks = {
    catchUpSince: vi.fn().mockResolvedValue(defaultResult),
    applyRemoteEvent: vi.fn().mockResolvedValue('updated'),
    applyHardDelete: vi.fn().mockResolvedValue(undefined),
    performSync: vi.fn().mockResolvedValue(defaultResult),
    ...overrides,
  }
  vi.mocked(SyncService).mockImplementation(() => mocks as unknown as SyncService)
  return mocks
}

// ── Options factory ───────────────────────────────────────────────────────────

function makeOptions(
  supabase: SupabaseClient,
  partial: Partial<RealtimeSyncOptions> = {},
): RealtimeSyncOptions {
  return {
    supabase,
    backendUrl: BACKEND,
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    userId: USER_ID,
    lastSyncTime: LAST_SYNC,
    onEvent: vi.fn(),
    onStateChange: vi.fn(),
    onTokenRefreshed: vi.fn(),
    ...partial,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flushPromises() {
  return new Promise<void>(resolve => setTimeout(resolve, 0))
}

function remotePrompt(id: string, updatedAt = '2026-06-01T00:00:00.000Z'): RemotePrompt {
  return {
    id,
    user_id: USER_ID,
    title: 'T',
    content: 'C',
    category: '',
    tags: [],
    usage_count: 0,
    last_used: null,
    is_favorite: false,
    created_at: LAST_SYNC,
    updated_at: updatedAt,
    deleted_at: null,
  }
}

// Complete the initial catch-up so the service transitions to 'live'
async function goLive(handle: ChannelHandle) {
  await handle.fireStatus('SUBSCRIBED')
}

// Build a service that is started and in the 'live' state
async function makeLiveService(partial: Partial<RealtimeSyncOptions> = {}) {
  const { channel, handle } = makeChannelMock()
  const supabase = makeSupabaseMock(channel)
  const syncMocks = makeSyncMock()
  const service = new RealtimeSyncService(makeOptions(supabase, partial))
  await service.start()
  await goLive(handle)
  return { service, handle, syncMocks, supabase }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RealtimeSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Channel subscription ───────────────────────────────────────────────────

  describe('start() — channel subscription', () => {
    it('subscribes to the correct topic and filter', async () => {
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      const service = new RealtimeSyncService(makeOptions(supabase))

      await service.start()

      expect(supabase.channel).toHaveBeenCalledWith(`prompts:${USER_ID}`)
      expect(handle.onFn).toHaveBeenCalledWith(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prompts', filter: `user_id=eq.${USER_ID}` },
        expect.any(Function),
      )
    })
  })

  // ── State transitions ──────────────────────────────────────────────────────

  describe('state transitions', () => {
    it('SUBSCRIBED → catchUpSince(lastSyncTime) → connecting → catching_up → live', async () => {
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      const syncMocks = makeSyncMock()
      const states: RealtimeState[] = []
      const service = new RealtimeSyncService(
        makeOptions(supabase, { onStateChange: (s) => states.push(s) }),
      )

      await service.start()
      await goLive(handle)

      expect(syncMocks.catchUpSince).toHaveBeenCalledWith(LAST_SYNC)
      expect(states).toEqual([
        { kind: 'connecting' },
        { kind: 'catching_up' },
        { kind: 'live' },
      ])
    })

    it('null lastSyncTime → catchUpSince called with null (falls back to performSync)', async () => {
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      const syncMocks = makeSyncMock()
      const service = new RealtimeSyncService(
        makeOptions(supabase, { lastSyncTime: null }),
      )

      await service.start()
      await goLive(handle)

      expect(syncMocks.catchUpSince).toHaveBeenCalledWith(null)
    })

    it('catch-up failure still transitions to live', async () => {
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock({ catchUpSince: vi.fn().mockRejectedValue(new Error('network error')) })
      const states: RealtimeState[] = []
      const service = new RealtimeSyncService(
        makeOptions(supabase, { onStateChange: (s) => states.push(s) }),
      )

      await service.start()
      await goLive(handle)

      expect(states.at(-1)).toEqual({ kind: 'live' })
    })
  })

  // ── Event buffering ────────────────────────────────────────────────────────

  describe('event buffering during catch-up', () => {
    it('buffers events while catch-up is running and drains them after', async () => {
      let resolveCatchUp!: () => void
      const blocker = new Promise<SyncResult>(res => {
        resolveCatchUp = () => res({ pushed: 0, pulled: 0, deleted: 0, errors: [] })
      })
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      const syncMocks = makeSyncMock({ catchUpSince: vi.fn().mockReturnValue(blocker) })
      const service = new RealtimeSyncService(makeOptions(supabase))

      await service.start()

      // Kick off catch-up but don't await
      const subDone = handle.fireStatus('SUBSCRIBED')

      // Yield enough microtasks to enter _runCatchUp's await point
      await Promise.resolve()
      await Promise.resolve()

      // Payload arrives during catch-up → should be buffered
      const record = remotePrompt('buf-1')
      handle.firePayload({ eventType: 'UPDATE', new: record, old: {}, errors: null })

      // Resolve catch-up → buffer drains
      resolveCatchUp()
      await subDone

      expect(syncMocks.applyRemoteEvent).toHaveBeenCalledWith(record)
    })
  })

  // ── Live event dispatching ─────────────────────────────────────────────────

  describe('event dispatching (live state)', () => {
    it('INSERT dispatches applyRemoteEvent with payload.new', async () => {
      const { syncMocks, handle } = await makeLiveService()
      const record = remotePrompt('ins-1')
      handle.firePayload({ eventType: 'INSERT', new: record, old: {}, errors: null })
      await flushPromises()
      expect(syncMocks.applyRemoteEvent).toHaveBeenCalledWith(record)
      expect(syncMocks.applyHardDelete).not.toHaveBeenCalled()
    })

    it('UPDATE dispatches applyRemoteEvent with payload.new', async () => {
      const { syncMocks, handle } = await makeLiveService()
      const record = remotePrompt('upd-1')
      handle.firePayload({ eventType: 'UPDATE', new: record, old: {}, errors: null })
      await flushPromises()
      expect(syncMocks.applyRemoteEvent).toHaveBeenCalledWith(record)
    })

    it('DELETE dispatches applyHardDelete with payload.old.id', async () => {
      const { syncMocks, handle } = await makeLiveService()
      const old = remotePrompt('del-1')
      handle.firePayload({ eventType: 'DELETE', new: {}, old, errors: null })
      await flushPromises()
      expect(syncMocks.applyHardDelete).toHaveBeenCalledWith('del-1')
      expect(syncMocks.applyRemoteEvent).not.toHaveBeenCalled()
    })

    it('payload with missing id is ignored', async () => {
      const { syncMocks, handle } = await makeLiveService()
      handle.firePayload({ eventType: 'UPDATE', new: { title: 'no-id' }, old: {}, errors: null })
      await flushPromises()
      expect(syncMocks.applyRemoteEvent).not.toHaveBeenCalled()
    })

    it('non-skipped applyRemoteEvent fires onEvent', async () => {
      const onEvent = vi.fn()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock({ applyRemoteEvent: vi.fn().mockResolvedValue('updated') })
      const service = new RealtimeSyncService(makeOptions(supabase, { onEvent }))
      await service.start()
      await goLive(handle)

      handle.firePayload({ eventType: 'UPDATE', new: remotePrompt('ev-1'), old: {}, errors: null })
      await flushPromises()
      expect(onEvent).toHaveBeenCalledWith({ op: 'update', id: 'ev-1' })
    })

    it('skipped applyRemoteEvent does NOT fire onEvent', async () => {
      const onEvent = vi.fn()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock({ applyRemoteEvent: vi.fn().mockResolvedValue('skipped') })
      const service = new RealtimeSyncService(makeOptions(supabase, { onEvent }))
      await service.start()
      await goLive(handle)

      handle.firePayload({ eventType: 'UPDATE', new: remotePrompt('ev-2'), old: {}, errors: null })
      await flushPromises()
      expect(onEvent).not.toHaveBeenCalled()
    })
  })

  // ── Echo suppression ───────────────────────────────────────────────────────

  describe('echo suppression (markOutbound)', () => {
    it('suppresses an event whose id + updated_at match the outbound marker', async () => {
      const { service, syncMocks, handle } = await makeLiveService()
      const updatedAt = '2026-06-01T12:00:00.000Z'
      service.markOutbound('p-1', updatedAt)

      handle.firePayload({
        eventType: 'UPDATE',
        new: remotePrompt('p-1', updatedAt),
        old: {},
        errors: null,
      })
      await flushPromises()

      expect(syncMocks.applyRemoteEvent).not.toHaveBeenCalled()
    })

    it('does NOT suppress an event with a different updated_at', async () => {
      const { service, syncMocks, handle } = await makeLiveService()
      service.markOutbound('p-2', '2026-06-01T12:00:00.000Z')

      const record = remotePrompt('p-2', '2026-06-02T00:00:00.000Z')
      handle.firePayload({ eventType: 'UPDATE', new: record, old: {}, errors: null })
      await flushPromises()

      expect(syncMocks.applyRemoteEvent).toHaveBeenCalledWith(record)
    })
  })

  // ── Error recovery ─────────────────────────────────────────────────────────

  describe('error recovery', () => {
    it('CHANNEL_ERROR: refresh succeeds → new channel built and onTokenRefreshed fires', async () => {
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      const onTokenRefreshed = vi.fn()
      const newSession: Partial<Session> = {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      }
      supabase.auth.refreshSession.mockResolvedValue({
        data: { session: newSession },
        error: null,
      })

      const service = new RealtimeSyncService(makeOptions(supabase, { onTokenRefreshed }))
      await service.start()
      await goLive(handle)

      await handle.fireStatus('CHANNEL_ERROR')

      expect(supabase.auth.refreshSession).toHaveBeenCalledWith({
        refresh_token: REFRESH_TOKEN,
      })
      expect(onTokenRefreshed).toHaveBeenCalledWith(newSession)
      // A second _connect() was issued after refresh
      expect(supabase.channel).toHaveBeenCalledTimes(2)
    })

    it('CHANNEL_ERROR: refresh fails → reconnecting state scheduled', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      supabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: new Error('expired'),
      })
      const states: RealtimeState[] = []
      const service = new RealtimeSyncService(
        makeOptions(supabase, { onStateChange: (s) => states.push(s) }),
      )
      await service.start()
      await goLive(handle)

      await handle.fireStatus('CHANNEL_ERROR')

      expect(states.at(-1)).toMatchObject({ kind: 'reconnecting' })
      vi.useRealTimers()
    })

    it('CLOSED while running → reconnecting state scheduled', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      const states: RealtimeState[] = []
      const service = new RealtimeSyncService(
        makeOptions(supabase, { onStateChange: (s) => states.push(s) }),
      )
      await service.start()
      await goLive(handle)

      await handle.fireStatus('CLOSED')

      expect(states.at(-1)).toMatchObject({ kind: 'reconnecting' })
      vi.useRealTimers()
    })
  })

  // ── Reconnect backoff ──────────────────────────────────────────────────────

  describe('reconnect backoff', () => {
    function failingRefresh(supabase: SupabaseMock) {
      supabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: new Error('expired'),
      })
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('first reconnect fires after 1 s', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      failingRefresh(supabase)

      const service = new RealtimeSyncService(makeOptions(supabase))
      await service.start()
      await goLive(handle)

      expect(supabase.channel).toHaveBeenCalledTimes(1)
      await handle.fireStatus('CHANNEL_ERROR')
      expect(supabase.channel).toHaveBeenCalledTimes(1) // timer not fired yet

      await vi.advanceTimersByTimeAsync(1001)
      expect(supabase.channel).toHaveBeenCalledTimes(2)
    })

    it('second reconnect fires after an additional 2 s', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      failingRefresh(supabase)

      const service = new RealtimeSyncService(makeOptions(supabase))
      await service.start()
      await goLive(handle)

      // First error → attempt 0 → 1 s
      await handle.fireStatus('CHANNEL_ERROR')
      await vi.advanceTimersByTimeAsync(1001)
      expect(supabase.channel).toHaveBeenCalledTimes(2)

      // Second error (no SUBSCRIBED → reconnectAttempt not reset) → attempt 1 → 2 s
      await handle.fireStatus('CHANNEL_ERROR')
      await vi.advanceTimersByTimeAsync(1999)
      expect(supabase.channel).toHaveBeenCalledTimes(2) // not yet

      await vi.advanceTimersByTimeAsync(2)
      expect(supabase.channel).toHaveBeenCalledTimes(3)
    })

    it('delay caps at 60 s after the 5th attempt', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      failingRefresh(supabase)

      const service = new RealtimeSyncService(makeOptions(supabase))
      await service.start()

      // Drive through 4 complete error+reconnect cycles (no catch-up) so
      // reconnectAttempt reaches 4 without being reset by a 'live' transition.
      const earlyDelays = [1001, 2001, 5001, 15001]
      for (const delay of earlyDelays) {
        await handle.fireStatus('CHANNEL_ERROR')
        await vi.advanceTimersByTimeAsync(delay)
      }

      const countBefore = supabase.channel.mock.calls.length

      // 5th error → attempt 4 → 60 s cap
      await handle.fireStatus('CHANNEL_ERROR')
      await vi.advanceTimersByTimeAsync(59_999)
      expect(supabase.channel).toHaveBeenCalledTimes(countBefore) // not yet

      await vi.advanceTimersByTimeAsync(2)
      expect(supabase.channel).toHaveBeenCalledTimes(countBefore + 1)
    })
  })

  // ── window.online early reconnect ──────────────────────────────────────────

  describe('window.online early reconnect', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('fires reconnect immediately when the network comes back online', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      supabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: new Error('expired'),
      })

      const service = new RealtimeSyncService(makeOptions(supabase))
      await service.start()
      await goLive(handle)

      await handle.fireStatus('CHANNEL_ERROR') // schedules 1 s timer
      expect(supabase.channel).toHaveBeenCalledTimes(1)

      // online event fires before the 1 s elapses → immediate reconnect
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
      await Promise.resolve()

      expect(supabase.channel).toHaveBeenCalledTimes(2)
    })
  })

  // ── stop() ────────────────────────────────────────────────────────────────

  describe('stop()', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('cancels in-flight reconnect timer so no reconnect fires', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      supabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: new Error('expired'),
      })

      const service = new RealtimeSyncService(makeOptions(supabase))
      await service.start()
      await goLive(handle)
      await handle.fireStatus('CHANNEL_ERROR') // schedules 1 s reconnect

      await service.stop()

      await vi.advanceTimersByTimeAsync(5000) // timer would have fired here
      expect(supabase.channel).toHaveBeenCalledTimes(1) // no extra connect
    })

    it('removes the window.online listener', async () => {
      vi.useFakeTimers()
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      supabase.auth.refreshSession.mockResolvedValue({
        data: { session: null },
        error: new Error('expired'),
      })
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      const service = new RealtimeSyncService(makeOptions(supabase))
      await service.start()
      await goLive(handle)
      await handle.fireStatus('CHANNEL_ERROR')

      await service.stop()

      expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    })

    it('transitions to closed state', async () => {
      const { channel, handle } = makeChannelMock()
      const supabase = makeSupabaseMock(channel)
      makeSyncMock()
      const states: RealtimeState[] = []
      const service = new RealtimeSyncService(
        makeOptions(supabase, { onStateChange: (s) => states.push(s) }),
      )

      await service.start()
      await goLive(handle)
      await service.stop()

      expect(states.at(-1)).toEqual({ kind: 'closed' })
    })
  })
})
