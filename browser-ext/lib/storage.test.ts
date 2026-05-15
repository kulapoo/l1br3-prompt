import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Prompt, Tag } from '../types'

// Mock the WXT browser global before importing storage.
const store: Record<string, unknown> = {}
vi.stubGlobal('browser', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj)
      }),
      remove: vi.fn(async (key: string) => {
        delete store[key]
      }),
    },
  },
})

import {
  cachePromptsFor,
  clearPromptCache,
  getCachedPromptsFor,
  getCachedPrompts,
  cachePrompts,
} from './storage'

const URL_A = 'http://localhost:8000'
const URL_B = 'http://localhost:9000'

const p1: Prompt = {
  id: '1', title: 'Prompt 1', content: 'Content 1', tags: [], category: '',
  isFavorite: false, usageCount: 0, lastUsed: null, createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}
const p2: Prompt = {
  id: '2', title: 'Prompt 2', content: 'Content 2', tags: [], category: '',
  isFavorite: false, usageCount: 0, lastUsed: null, createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}
const tags: Tag[] = []

beforeEach(() => {
  // Clear in-memory store and mocks between tests
  for (const k of Object.keys(store)) delete store[k]
  vi.clearAllMocks()
})

describe('getCachedPromptsFor — URL scoping', () => {
  it('returns the entry when backendUrl matches', async () => {
    await cachePromptsFor(URL_A, [p1, p2], tags)
    const entry = await getCachedPromptsFor(URL_A)
    expect(entry).not.toBeNull()
    expect(entry!.prompts).toHaveLength(2)
    expect(entry!.backendUrl).toBe(URL_A)
  })

  it('returns null when backendUrl does not match (cross-backend isolation)', async () => {
    await cachePromptsFor(URL_A, [p1, p2], tags)
    const entry = await getCachedPromptsFor(URL_B)
    expect(entry).toBeNull()
  })

  it('returns null when the cache is empty', async () => {
    const entry = await getCachedPromptsFor(URL_A)
    expect(entry).toBeNull()
  })
})

describe('getCachedPromptsFor — legacy / malformed entries', () => {
  it('treats an entry missing backendUrl as a cache miss', async () => {
    // Simulate a legacy entry written by the old cachePrompts helper (no backendUrl field).
    await cachePrompts([p1], tags)
    const entry = await getCachedPromptsFor(URL_A)
    expect(entry).toBeNull()
  })

  it('treats a completely malformed storage value as a cache miss', async () => {
    // Directly corrupt the store with a non-object value.
    store['l1br3_prompt_cache'] = 'not-an-object'
    const entry = await getCachedPromptsFor(URL_A)
    expect(entry).toBeNull()
  })
})

describe('clearPromptCache', () => {
  it('removes the entry so subsequent reads return null', async () => {
    await cachePromptsFor(URL_A, [p1], tags)
    await clearPromptCache()
    const entry = await getCachedPromptsFor(URL_A)
    expect(entry).toBeNull()
  })
})

describe('cachePromptsFor — stamped backendUrl field', () => {
  it('overwrites a prior URL-A entry when writing for URL-B', async () => {
    await cachePromptsFor(URL_A, [p1], tags)
    await cachePromptsFor(URL_B, [p2], tags)

    // URL_A entry is gone — replaced by URL_B's.
    expect(await getCachedPromptsFor(URL_A)).toBeNull()
    const entryB = await getCachedPromptsFor(URL_B)
    expect(entryB!.prompts).toHaveLength(1)
    expect(entryB!.prompts[0].id).toBe('2')
  })
})

describe('CRUD-then-offline scenario (storage layer)', () => {
  it('reflects the post-delete state when the cache is refreshed after mutation', async () => {
    // Backend is online: cache holds [p1, p2].
    await cachePromptsFor(URL_A, [p1, p2], tags)

    // Mutation succeeds: backend now has only [p1].
    // refreshPromptsCache calls cachePromptsFor with the post-delete list.
    await cachePromptsFor(URL_A, [p1], tags)

    // Backend goes offline; extension reads from cache.
    const entry = await getCachedPromptsFor(URL_A)
    expect(entry).not.toBeNull()
    expect(entry!.prompts).toHaveLength(1)
    expect(entry!.prompts[0].id).toBe('1')
  })
})

describe('getCachedPrompts (legacy helper)', () => {
  it('still reads entries written by cachePrompts (existing behaviour preserved)', async () => {
    await cachePrompts([p1], tags)
    const entry = await getCachedPrompts()
    expect(entry).not.toBeNull()
    expect(entry!.prompts).toHaveLength(1)
  })
})
