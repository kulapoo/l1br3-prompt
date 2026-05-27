import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  decideAction,
  enqueueConflict,
  listConflicts,
  removeConflict,
  getWatermark,
  setWatermark,
  clearWatermark,
  type Conflict,
} from './conflicts'
import type { LocalPrompt, RemotePrompt } from './sync'

// ── browser.storage.local stub ────────────────────────────────────────────────

type StorageListener = (c: Record<string, { newValue?: unknown }>, area: string) => void

interface StorageStub {
  store: Map<string, unknown>
  listeners: StorageListener[]
}

const stub: StorageStub = { store: new Map(), listeners: [] }

beforeEach(() => {
  stub.store.clear()
  stub.listeners.length = 0
  ;(globalThis as unknown as { browser: unknown }).browser = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => {
          const v = stub.store.get(key)
          return v === undefined ? {} : { [key]: v }
        }),
        set: vi.fn(async (data: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(data)) {
            stub.store.set(k, v)
            for (const l of stub.listeners) l({ [k]: { newValue: v } }, 'local')
          }
        }),
        remove: vi.fn(async (key: string) => {
          stub.store.delete(key)
        }),
      },
      onChanged: {
        addListener: (fn: StorageListener) => stub.listeners.push(fn),
        removeListener: (fn: StorageListener) => {
          const i = stub.listeners.indexOf(fn)
          if (i >= 0) stub.listeners.splice(i, 1)
        },
      },
    },
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLocal(overrides: Partial<LocalPrompt> = {}): LocalPrompt {
  return {
    id: 'p1',
    title: 'T',
    content: 'C',
    category: 'General',
    tags: [],
    usageCount: 0,
    lastUsed: null,
    isFavorite: false,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeRemote(overrides: Partial<RemotePrompt> = {}): RemotePrompt {
  return {
    id: 'p1',
    user_id: 'u1',
    title: 'T',
    content: 'C',
    category: 'General',
    tags: [],
    usage_count: 0,
    last_used: null,
    is_favorite: false,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

// ── decideAction ──────────────────────────────────────────────────────────────

describe('decideAction', () => {
  it('returns push when remote is absent', () => {
    expect(decideAction(makeLocal(), undefined, null)).toBe('push')
  })

  it('returns pull when local is absent', () => {
    expect(decideAction(undefined, makeRemote(), null)).toBe('pull')
  })

  it('returns none when timestamps are equal', () => {
    expect(decideAction(makeLocal(), makeRemote(), null)).toBe('none')
  })

  it('falls back to LWW when no watermark exists (newer remote wins)', () => {
    const local = makeLocal({ updatedAt: '2026-05-01T00:00:00Z' })
    const remote = makeRemote({ updated_at: '2026-05-02T00:00:00Z' })
    expect(decideAction(local, remote, null)).toBe('pull')
  })

  it('falls back to LWW when no watermark exists (newer local wins)', () => {
    const local = makeLocal({ updatedAt: '2026-05-02T00:00:00Z' })
    const remote = makeRemote({ updated_at: '2026-05-01T00:00:00Z' })
    expect(decideAction(local, remote, null)).toBe('push')
  })

  it('detects conflict when both sides diverged from base', () => {
    const base = '2026-05-01T00:00:00Z'
    const local = makeLocal({ updatedAt: '2026-05-02T00:00:00Z' })
    const remote = makeRemote({ updated_at: '2026-05-02T12:00:00Z' })
    expect(decideAction(local, remote, base)).toBe('conflict')
  })

  it('pulls when only remote diverged from base', () => {
    const base = '2026-05-01T00:00:00Z'
    const local = makeLocal({ updatedAt: base })
    const remote = makeRemote({ updated_at: '2026-05-02T00:00:00Z' })
    expect(decideAction(local, remote, base)).toBe('pull')
  })

  it('pushes when only local diverged from base', () => {
    const base = '2026-05-01T00:00:00Z'
    const local = makeLocal({ updatedAt: '2026-05-02T00:00:00Z' })
    const remote = makeRemote({ updated_at: base })
    expect(decideAction(local, remote, base)).toBe('push')
  })

  it('falls back to LWW for delete-vs-edit (delete wins when newer)', () => {
    const base = '2026-05-01T00:00:00Z'
    const local = makeLocal({ updatedAt: '2026-05-02T00:00:00Z' })
    const remote = makeRemote({
      updated_at: '2026-05-03T00:00:00Z',
      deleted_at: '2026-05-03T00:00:00Z',
    })
    expect(decideAction(local, remote, base)).toBe('softDeleteLocal')
  })

  it('pushes local edit over older remote tombstone (delete-vs-edit, edit wins)', () => {
    const base = '2026-05-01T00:00:00Z'
    const local = makeLocal({ updatedAt: '2026-05-04T00:00:00Z' })
    const remote = makeRemote({
      updated_at: '2026-05-03T00:00:00Z',
      deleted_at: '2026-05-03T00:00:00Z',
    })
    expect(decideAction(local, remote, base)).toBe('push')
  })
})

// ── Watermark roundtrip ───────────────────────────────────────────────────────

describe('watermarks', () => {
  it('round-trips a watermark value', async () => {
    expect(await getWatermark('p1')).toBeNull()
    await setWatermark('p1', '2026-05-01T00:00:00Z')
    expect(await getWatermark('p1')).toBe('2026-05-01T00:00:00Z')
  })

  it('clears a single watermark without affecting others', async () => {
    await setWatermark('p1', '2026-05-01T00:00:00Z')
    await setWatermark('p2', '2026-05-02T00:00:00Z')
    await clearWatermark('p1')
    expect(await getWatermark('p1')).toBeNull()
    expect(await getWatermark('p2')).toBe('2026-05-02T00:00:00Z')
  })
})

// ── Conflict queue ────────────────────────────────────────────────────────────

function makeConflict(promptId: string): Conflict {
  return {
    id: promptId,
    promptId,
    local: {
      id: promptId,
      title: 'local',
      content: 'L',
      category: 'General',
      tags: [],
      isFavorite: false,
      updatedAt: '2026-05-02T00:00:00Z',
      deletedAt: null,
    },
    remote: {
      id: promptId,
      title: 'remote',
      content: 'R',
      category: 'General',
      tags: [],
      isFavorite: false,
      updatedAt: '2026-05-02T12:00:00Z',
      deletedAt: null,
    },
    baseUpdatedAt: '2026-05-01T00:00:00Z',
    detectedAt: '2026-05-03T00:00:00Z',
  }
}

describe('conflict queue', () => {
  it('enqueues and lists conflicts', async () => {
    await enqueueConflict(makeConflict('p1'))
    const list = await listConflicts()
    expect(list).toHaveLength(1)
    expect(list[0].promptId).toBe('p1')
  })

  it('dedups by promptId (latest wins)', async () => {
    await enqueueConflict({
      ...makeConflict('p1'),
      detectedAt: '2026-05-03T00:00:00Z',
    })
    await enqueueConflict({
      ...makeConflict('p1'),
      detectedAt: '2026-05-03T12:00:00Z',
    })
    const list = await listConflicts()
    expect(list).toHaveLength(1)
    expect(list[0].detectedAt).toBe('2026-05-03T12:00:00Z')
  })

  it('removes a conflict by id', async () => {
    await enqueueConflict(makeConflict('p1'))
    await enqueueConflict(makeConflict('p2'))
    await removeConflict('p1')
    const list = await listConflicts()
    expect(list).toHaveLength(1)
    expect(list[0].promptId).toBe('p2')
  })
})
