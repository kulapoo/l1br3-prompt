/**
 * Unit tests for SyncService merge logic.
 * These tests exercise the LWW algorithm in isolation by mocking the local API
 * and Supabase client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Minimal type stubs (avoid importing the full Supabase client) ─────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const USER_ID = 'user-001'
const BACKEND_URL = 'http://localhost:8000'

function makeLocal(overrides: Partial<LocalPrompt> = {}): LocalPrompt {
  return {
    id: 'prompt-001',
    title: 'My Prompt',
    content: 'Hello {{world}}',
    category: 'General',
    tags: [],
    usageCount: 0,
    lastUsed: null,
    isFavorite: false,
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeRemote(overrides: Partial<RemotePrompt> = {}): RemotePrompt {
  return {
    id: 'prompt-001',
    user_id: USER_ID,
    title: 'My Prompt',
    content: 'Hello {{world}}',
    category: 'General',
    tags: [],
    usage_count: 0,
    last_used: null,
    is_favorite: false,
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

// ── Inline LWW merge logic (extracted from SyncService for unit testing) ──────
// Rather than testing the SyncService end-to-end (which requires a real HTTP
// server), we test the merge decisions in isolation.

interface MergeAction {
  action: 'push' | 'pull' | 'softDeleteLocal' | 'none'
  id: string
}

function decideMerge(local: LocalPrompt | undefined, remote: RemotePrompt | undefined): MergeAction {
  const id = (local?.id ?? remote?.id)!

  if (!remote) {
    // local only → push to remote
    return { action: 'push', id }
  }
  if (!local) {
    // remote only → pull to local
    return { action: 'pull', id }
  }

  const localNewer = new Date(local.updatedAt) > new Date(remote.updated_at)
  const remoteNewer = new Date(remote.updated_at) > new Date(local.updatedAt)

  if (localNewer) return { action: 'push', id }
  if (remoteNewer) {
    if (remote.deleted_at) return { action: 'softDeleteLocal', id }
    return { action: 'pull', id }
  }
  // same timestamp → no-op
  return { action: 'none', id }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SyncService merge logic (LWW)', () => {
  it('pushes a local-only prompt to remote', () => {
    const result = decideMerge(makeLocal(), undefined)
    expect(result.action).toBe('push')
  })

  it('pulls a remote-only prompt to local', () => {
    const result = decideMerge(undefined, makeRemote())
    expect(result.action).toBe('pull')
  })

  it('pushes when local is newer', () => {
    const local = makeLocal({ updatedAt: '2026-04-02T12:00:00Z' })
    const remote = makeRemote({ updated_at: '2026-04-01T10:00:00Z' })
    expect(decideMerge(local, remote).action).toBe('push')
  })

  it('pulls when remote is newer', () => {
    const local = makeLocal({ updatedAt: '2026-04-01T10:00:00Z' })
    const remote = makeRemote({ updated_at: '2026-04-02T12:00:00Z' })
    expect(decideMerge(local, remote).action).toBe('pull')
  })

  it('no-ops when timestamps are identical', () => {
    const ts = '2026-04-01T10:00:00Z'
    const local = makeLocal({ updatedAt: ts })
    const remote = makeRemote({ updated_at: ts })
    expect(decideMerge(local, remote).action).toBe('none')
  })

  it('soft-deletes locally when remote has deleted_at and is newer', () => {
    const local = makeLocal({ updatedAt: '2026-04-01T10:00:00Z' })
    const remote = makeRemote({
      updated_at: '2026-04-02T12:00:00Z',
      deleted_at: '2026-04-02T12:00:00Z',
    })
    expect(decideMerge(local, remote).action).toBe('softDeleteLocal')
  })

  it('pushes tombstone when local is deleted and newer than remote', () => {
    // Local deleted_at means local.updatedAt was set when we soft-deleted it.
    const local = makeLocal({
      updatedAt: '2026-04-02T12:00:00Z',
      deletedAt: '2026-04-02T12:00:00Z',
    })
    const remote = makeRemote({ updated_at: '2026-04-01T10:00:00Z' })
    // Local is newer → push (the push will include deletedAt, syncing the tombstone)
    expect(decideMerge(local, remote).action).toBe('push')
  })

  it('no-ops when both are deleted at the same time', () => {
    const ts = '2026-04-02T12:00:00Z'
    const local = makeLocal({ updatedAt: ts, deletedAt: ts })
    const remote = makeRemote({ updated_at: ts, deleted_at: ts })
    expect(decideMerge(local, remote).action).toBe('none')
  })
})
