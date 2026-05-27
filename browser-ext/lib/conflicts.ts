/**
 * Conflict store + watermarks for F10 sync conflict resolution.
 *
 * Watermark per prompt = the remote `updated_at` we most recently observed in
 * sync with the local copy. Used as a "common base" to detect when both sides
 * have diverged from the same starting point.
 *
 * Conflicts are stored as immutable snapshots so the dialog can render a stable
 * left/right comparison even after further remote events arrive.
 */

import type { LocalPrompt, RemotePrompt } from './sync'

const CONFLICTS_KEY = 'l1br3_conflicts'
const WATERMARKS_KEY = 'l1br3_sync_watermarks'

const MAX_QUEUE = 50

export interface PromptSnapshot {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  isFavorite: boolean
  updatedAt: string
  deletedAt: string | null
}

export interface Conflict {
  id: string // unique conflict id (uuid-ish, can reuse promptId since we dedup)
  promptId: string
  local: PromptSnapshot
  remote: PromptSnapshot
  baseUpdatedAt: string | null
  detectedAt: string
}

export type ConflictChoice =
  | { kind: 'local' }
  | { kind: 'remote' }
  | { kind: 'manual'; resolved: Omit<PromptSnapshot, 'id' | 'updatedAt' | 'deletedAt'> }

export type DecideAction =
  | 'push'
  | 'pull'
  | 'softDeleteLocal'
  | 'conflict'
  | 'none'

/**
 * Pure decision function — given local, remote, and the last-known synced
 * watermark, decide what to do. Centralized so tests don't need the full
 * SyncService.
 *
 * Conflict semantics: both sides have changed since the shared base (or, with
 * no base, both sides exist with distinct updatedAt values and neither is a
 * tombstone — first-sync conservative path).
 */
export function decideAction(
  local: LocalPrompt | undefined,
  remote: RemotePrompt | undefined,
  base: string | null,
): DecideAction {
  if (!local && !remote) return 'none'
  if (!remote) return 'push'
  if (!local) return 'pull'

  const localTs = new Date(local.updatedAt).getTime()
  const remoteTs = new Date(remote.updated_at).getTime()

  if (localTs === remoteTs) return 'none'

  // Delete-vs-edit deferred to F10.1 — fall back to LWW with the tombstone
  // winning on either side, no conflict raised.
  if (local.deletedAt || remote.deleted_at) {
    if (remoteTs > localTs) {
      return remote.deleted_at ? 'softDeleteLocal' : 'pull'
    }
    return 'push'
  }

  // No watermark → first sync: cannot prove divergence, fall back to LWW.
  if (!base) {
    return remoteTs > localTs ? 'pull' : 'push'
  }

  const baseTs = new Date(base).getTime()
  const localChanged = localTs > baseTs
  const remoteChanged = remoteTs > baseTs

  if (localChanged && remoteChanged) return 'conflict'
  if (localChanged) return 'push'
  if (remoteChanged) return 'pull'
  return 'none'
}

export function localToSnapshot(p: LocalPrompt): PromptSnapshot {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    category: p.category,
    tags: p.tags.map((t) => t.name),
    isFavorite: p.isFavorite,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
  }
}

export function remoteToSnapshot(p: RemotePrompt): PromptSnapshot {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    category: p.category,
    tags: p.tags,
    isFavorite: p.is_favorite,
    updatedAt: p.updated_at,
    deletedAt: p.deleted_at,
  }
}

// ── Watermark store ─────────────────────────────────────────────────────────

export async function getWatermark(promptId: string): Promise<string | null> {
  try {
    const result = await browser.storage.local.get(WATERMARKS_KEY)
    const map = (result[WATERMARKS_KEY] as Record<string, string> | undefined) ?? {}
    return map[promptId] ?? null
  } catch {
    return null
  }
}

export async function setWatermark(promptId: string, updatedAt: string): Promise<void> {
  try {
    const result = await browser.storage.local.get(WATERMARKS_KEY)
    const map = (result[WATERMARKS_KEY] as Record<string, string> | undefined) ?? {}
    map[promptId] = updatedAt
    await browser.storage.local.set({ [WATERMARKS_KEY]: map })
  } catch {
    // swallow
  }
}

export async function clearWatermark(promptId: string): Promise<void> {
  try {
    const result = await browser.storage.local.get(WATERMARKS_KEY)
    const map = (result[WATERMARKS_KEY] as Record<string, string> | undefined) ?? {}
    delete map[promptId]
    await browser.storage.local.set({ [WATERMARKS_KEY]: map })
  } catch {
    // swallow
  }
}

// ── Conflict queue ──────────────────────────────────────────────────────────

export async function listConflicts(): Promise<Conflict[]> {
  try {
    const result = await browser.storage.local.get(CONFLICTS_KEY)
    return (result[CONFLICTS_KEY] as Conflict[] | undefined) ?? []
  } catch {
    return []
  }
}

export async function enqueueConflict(c: Conflict): Promise<void> {
  try {
    const existing = await listConflicts()
    // Dedup by promptId — only one pending conflict per prompt at a time.
    const filtered = existing.filter((e) => e.promptId !== c.promptId)
    const next = [c, ...filtered].slice(0, MAX_QUEUE)
    await browser.storage.local.set({ [CONFLICTS_KEY]: next })
  } catch {
    // swallow
  }
}

export async function getConflict(id: string): Promise<Conflict | null> {
  const all = await listConflicts()
  return all.find((c) => c.id === id) ?? null
}

export async function removeConflict(id: string): Promise<void> {
  try {
    const existing = await listConflicts()
    const next = existing.filter((c) => c.id !== id)
    await browser.storage.local.set({ [CONFLICTS_KEY]: next })
  } catch {
    // swallow
  }
}

export async function clearConflicts(): Promise<void> {
  try {
    await browser.storage.local.remove(CONFLICTS_KEY)
  } catch {
    // swallow
  }
}

/** Subscribe to queue changes via browser.storage.onChanged. Returns unsubscribe. */
export function subscribeConflicts(cb: (conflicts: Conflict[]) => void): () => void {
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local') return
    if (!(CONFLICTS_KEY in changes)) return
    const next = (changes[CONFLICTS_KEY].newValue as Conflict[] | undefined) ?? []
    cb(next)
  }
  browser.storage.onChanged.addListener(handler)
  return () => browser.storage.onChanged.removeListener(handler)
}
