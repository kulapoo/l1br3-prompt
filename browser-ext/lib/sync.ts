/**
 * SyncService — extension-orchestrated LWW sync between local backend and Supabase.
 *
 * Architecture:
 *   Extension ↔ Local FastAPI  (reads/writes prompts via REST)
 *   Extension ↔ Supabase       (reads/writes prompts via Supabase JS client)
 *
 * Conflict resolution: last-write-wins on updated_at.
 * Deletions: soft-delete tombstones (deleted_at) are synced to Supabase, then
 *            a hard-delete is performed locally after the tombstone is pushed.
 */

import { SupabaseClient } from '@supabase/supabase-js'

const LOCAL_API_PAGE_SIZE = 200

// Shape of a prompt from the local FastAPI (camelCase, per schema serialization_alias)
interface LocalPrompt {
  id: string
  title: string
  content: string
  category: string
  tags: Array<{ id: string; name: string; color: string }>
  usageCount: number
  lastUsed: string | null
  isFavorite: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// Shape of a prompt row in Supabase (snake_case, matches schema.sql)
interface RemotePrompt {
  id: string
  user_id: string
  title: string
  content: string
  category: string
  tags: string[]
  usage_count: number
  last_used: string | null
  is_favorite: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface SyncResult {
  pushed: number
  pulled: number
  deleted: number
  errors: string[]
}

export class SyncService {
  private backendUrl: string
  private supabase: SupabaseClient
  private accessToken: string
  private userId: string

  constructor(
    backendUrl: string,
    supabase: SupabaseClient,
    accessToken: string,
    userId: string
  ) {
    this.backendUrl = backendUrl
    this.supabase = supabase
    this.accessToken = accessToken
    this.userId = userId
  }

  async performSync(): Promise<SyncResult> {
    const result: SyncResult = { pushed: 0, pulled: 0, deleted: 0, errors: [] }

    // 1. Fetch all local prompts (including soft-deleted tombstones)
    const localPrompts = await this._fetchAllLocal()

    // 2. Fetch all remote prompts for this user
    const remotePrompts = await this._fetchAllRemote()

    const remoteById = new Map(remotePrompts.map((p) => [p.id, p]))
    const localById = new Map(localPrompts.map((p) => [p.id, p]))

    // 3. Process local prompts → push to Supabase where local is newer
    for (const local of localPrompts) {
      try {
        const remote = remoteById.get(local.id)

        if (!remote) {
          // New local prompt — upsert to Supabase
          await this._upsertRemote(local)
          result.pushed++
        } else {
          const localNewer = new Date(local.updatedAt) > new Date(remote.updated_at)

          if (localNewer) {
            await this._upsertRemote(local)
            result.pushed++
          }
          // If remote is newer, handle below
        }
      } catch (err) {
        result.errors.push(`Push ${local.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 4. Process remote prompts → pull to local where remote is newer
    for (const remote of remotePrompts) {
      try {
        const local = localById.get(remote.id)

        if (!local) {
          // New remote prompt — create locally
          await this._createLocal(remote)
          result.pulled++
        } else {
          const remoteNewer = new Date(remote.updated_at) > new Date(local.updatedAt)

          if (remoteNewer) {
            if (remote.deleted_at) {
              // Remote deleted — soft-delete locally if not already
              if (!local.deletedAt) {
                await this._softDeleteLocal(local.id)
                result.deleted++
              }
            } else {
              // Remote updated — apply to local
              await this._updateLocal(remote, local)
              result.pulled++
            }
          }
        }
      } catch (err) {
        result.errors.push(`Pull ${remote.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return result
  }

  // ── Local API helpers ───────────────────────────────────────────────────────

  private async _fetchAllLocal(): Promise<LocalPrompt[]> {
    const all: LocalPrompt[] = []
    let page = 1

    while (true) {
      const res = await fetch(
        `${this.backendUrl}/api/v1/prompts?include_deleted=true&page=${page}&limit=${LOCAL_API_PAGE_SIZE}`
      )
      if (!res.ok) throw new Error(`Local API error: ${res.status}`)
      const body = await res.json()
      const items: LocalPrompt[] = body.data ?? []
      all.push(...items)
      if (items.length < LOCAL_API_PAGE_SIZE) break
      page++
    }

    return all
  }

  private async _createLocal(remote: RemotePrompt): Promise<void> {
    const body = {
      title: remote.title,
      content: remote.content,
      category: remote.category,
      isFavorite: remote.is_favorite,
      tags: remote.tags.map((name) => ({ name, color: '#6B7280' })),
    }
    const res = await fetch(`${this.backendUrl}/api/v1/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Create local failed: ${res.status}`)
  }

  private async _updateLocal(remote: RemotePrompt, local: LocalPrompt): Promise<void> {
    const body = {
      title: remote.title,
      content: remote.content,
      category: remote.category,
      isFavorite: remote.is_favorite,
      tags: remote.tags.map((name) => ({ name, color: '#6B7280' })),
    }
    const res = await fetch(`${this.backendUrl}/api/v1/prompts/${local.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Update local failed: ${res.status}`)
  }

  private async _softDeleteLocal(id: string): Promise<void> {
    const res = await fetch(`${this.backendUrl}/api/v1/prompts/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error(`Soft-delete local failed: ${res.status}`)
  }

  // ── Remote (Supabase) helpers ───────────────────────────────────────────────

  private async _fetchAllRemote(): Promise<RemotePrompt[]> {
    const { data, error } = await this.supabase
      .from('prompts')
      .select('*')
      .eq('user_id', this.userId)
      .setHeader('Authorization', `Bearer ${this.accessToken}`)

    if (error) throw new Error(`Supabase fetch error: ${error.message}`)
    return (data ?? []) as RemotePrompt[]
  }

  private async _upsertRemote(local: LocalPrompt): Promise<void> {
    const row: Omit<RemotePrompt, 'user_id'> & { user_id: string } = {
      id: local.id,
      user_id: this.userId,
      title: local.title,
      content: local.content,
      category: local.category,
      tags: local.tags.map((t) => t.name),
      usage_count: local.usageCount,
      last_used: local.lastUsed,
      is_favorite: local.isFavorite,
      created_at: local.createdAt,
      updated_at: local.updatedAt,
      deleted_at: local.deletedAt,
    }

    const { error } = await this.supabase
      .from('prompts')
      .upsert(row, { onConflict: 'id' })
      .setHeader('Authorization', `Bearer ${this.accessToken}`)

    if (error) throw new Error(`Supabase upsert error: ${error.message}`)
  }
}
