import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { Conflict } from '../lib/conflicts'

vi.mock('../lib/conflicts', () => ({
  listConflicts: vi.fn(),
  subscribeConflicts: vi.fn(),
}))

import { listConflicts, subscribeConflicts } from '../lib/conflicts'
import { useConflicts } from './useConflicts'

function makeConflict(id: string): Conflict {
  return {
    id,
    promptId: id,
    local: {
      id,
      title: 'local',
      content: 'L',
      category: 'General',
      tags: [],
      isFavorite: false,
      updatedAt: '2026-05-02T00:00:00Z',
      deletedAt: null,
    },
    remote: {
      id,
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(subscribeConflicts).mockReturnValue(vi.fn())
})

describe('useConflicts', () => {
  it('initial load — listConflicts resolves with items', async () => {
    const items = [makeConflict('p1'), makeConflict('p2')]
    vi.mocked(listConflicts).mockResolvedValue(items)

    const { result } = renderHook(() => useConflicts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.conflicts).toHaveLength(2)
    expect(vi.mocked(listConflicts)).toHaveBeenCalledTimes(1)
  })

  it('count mirrors conflicts.length', async () => {
    vi.mocked(listConflicts).mockResolvedValue([
      makeConflict('p1'),
      makeConflict('p2'),
      makeConflict('p3'),
    ])

    const { result } = renderHook(() => useConflicts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.count).toBe(3)
    expect(result.current.count).toBe(result.current.conflicts.length)
  })

  it('loading is true before and false after initial load resolves', async () => {
    let resolve!: (c: Conflict[]) => void
    vi.mocked(listConflicts).mockReturnValue(new Promise((r) => { resolve = r }))

    const { result } = renderHook(() => useConflicts())
    expect(result.current.loading).toBe(true)

    act(() => resolve([makeConflict('p1')]))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('unmount cleanup — unsubscribe called once', async () => {
    vi.mocked(listConflicts).mockResolvedValue([])
    const mockUnsubscribe = vi.fn()
    vi.mocked(subscribeConflicts).mockReturnValue(mockUnsubscribe)

    const { unmount } = renderHook(() => useConflicts())
    await waitFor(() => expect(vi.mocked(listConflicts)).toHaveBeenCalled())

    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  it('subscription callback updates conflicts state', async () => {
    vi.mocked(listConflicts).mockResolvedValue([])

    const { result } = renderHook(() => useConflicts())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const cb = vi.mocked(subscribeConflicts).mock.calls[0][0]
    const newConflicts = [makeConflict('p1'), makeConflict('p2')]
    act(() => cb(newConflicts))

    expect(result.current.conflicts).toHaveLength(2)
    expect(result.current.count).toBe(2)
  })
})
