import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt, PromptStats } from '../types'

vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../lib/api', () => ({ fetchPromptStats: vi.fn() }))
vi.mock('../lib/storage', () => ({
  cacheStats: vi.fn(),
  getCachedStats: vi.fn(),
}))

import { useAppConfig } from '../contexts/AppConfig'
import { fetchPromptStats } from '../lib/api'
import { cacheStats, getCachedStats } from '../lib/storage'
import { usePromptStats } from './usePromptStats'

const fullStats: PromptStats = {
  totalPrompts: 10,
  totalCopies: 25,
  favoritesCount: 3,
  topUsed: [{ id: '1', title: 'Top', usageCount: 5, lastUsed: '2026-05-01T00:00:00Z' }],
  stale: [{ id: '2', title: 'Old', usageCount: 0, lastUsed: null }],
  byCategory: [{ category: 'Code', count: 7 }],
}

const mockConfig: AppConfig = {
  backend: { isInstalled: true, url: 'http://localhost:8000' },
  ai: {
    localConnected: false,
    activeProvider: null,
    selectedModel: null, availableModels: [],
    providers: [], assignments: { chat: null, transform: null },
  },
  viewMode: 'sidebar',
  quickActions: [],
}

const baseCtx = {
  config: mockConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateAi: vi.fn(),
  activeTab: 'compose' as const,
  setActiveTab: vi.fn(),
  editingPrompt: null as Prompt | null,
  setEditingPrompt: vi.fn(),
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAppConfig).mockReturnValue(baseCtx as unknown as ReturnType<typeof useAppConfig>)
  vi.mocked(getCachedStats).mockResolvedValue(null)
  vi.mocked(fetchPromptStats).mockResolvedValue(fullStats)
  vi.mocked(cacheStats).mockResolvedValue(undefined)
})

describe('usePromptStats', () => {
  it('backend hit: returns fetched stats, caches them, isFromCache false', async () => {
    const { result } = renderHook(() => usePromptStats(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.stats).toEqual(fullStats))
    expect(result.current.isFromCache).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(cacheStats).toHaveBeenCalledWith(fullStats)
  })

  it('fetch fails with cache available: returns cached stats, isFromCache true', async () => {
    vi.mocked(fetchPromptStats).mockRejectedValue(new Error('offline'))
    vi.mocked(getCachedStats).mockResolvedValue(fullStats)

    const { result } = renderHook(() => usePromptStats(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.stats).toEqual(fullStats))
    expect(result.current.isFromCache).toBe(true)
  })

  it('backend not installed: returns cached stats without calling fetch', async () => {
    vi.mocked(getCachedStats).mockResolvedValue(fullStats)
    vi.mocked(useAppConfig).mockReturnValue({
      ...baseCtx,
      config: { ...mockConfig, backend: { isInstalled: false, url: '' } },
    } as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => usePromptStats(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.stats).toEqual(fullStats))
    expect(result.current.isFromCache).toBe(true)
    expect(fetchPromptStats).not.toHaveBeenCalled()
  })

  it('fetch fails and no cache: returns null stats, isFromCache false, isLoading false', async () => {
    vi.mocked(fetchPromptStats).mockRejectedValue(new Error('offline'))
    vi.mocked(getCachedStats).mockResolvedValue(null)

    const { result } = renderHook(() => usePromptStats(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats).toBeNull()
    expect(result.current.isFromCache).toBe(false)
  })
})
