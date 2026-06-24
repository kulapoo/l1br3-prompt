import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'

vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../lib/api', () => ({ fetchCategories: vi.fn() }))
vi.mock('../lib/storage', () => ({
  cacheCategories: vi.fn(),
  getCachedCategories: vi.fn(),
}))

import { useAppConfig } from '../contexts/AppConfig'
import { fetchCategories } from '../lib/api'
import { cacheCategories, getCachedCategories } from '../lib/storage'
import { useCategories } from './useCategories'

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
  vi.mocked(getCachedCategories).mockResolvedValue([])
  vi.mocked(fetchCategories).mockResolvedValue([])
  vi.mocked(cacheCategories).mockResolvedValue(undefined)
})

describe('useCategories', () => {
  it('backend hit: returns query data, isFromCache false, caches the result', async () => {
    vi.mocked(fetchCategories).mockResolvedValue(['Code', 'Writing'])

    const { result } = renderHook(() => useCategories(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.categories).toEqual(['Code', 'Writing']))
    expect(result.current.isFromCache).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(cacheCategories).toHaveBeenCalledWith(['Code', 'Writing'])
  })

  it('offline (isInstalled false): returns cached values, isFromCache true, never calls fetchCategories', async () => {
    vi.mocked(getCachedCategories).mockResolvedValue(['Research', 'Writing'])
    vi.mocked(useAppConfig).mockReturnValue({
      ...baseCtx,
      config: { ...mockConfig, backend: { isInstalled: false, url: '' } },
    } as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => useCategories(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.categories).toEqual(['Research', 'Writing']))
    expect(result.current.isFromCache).toBe(true)
    expect(fetchCategories).not.toHaveBeenCalled()
  })

  it('offline with empty cache: returns [], isLoading false', async () => {
    vi.mocked(getCachedCategories).mockResolvedValue([])
    vi.mocked(useAppConfig).mockReturnValue({
      ...baseCtx,
      config: { ...mockConfig, backend: { isInstalled: false, url: '' } },
    } as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => useCategories(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.categories).toEqual([])
  })

  it('backend returns empty array: returns [], isFromCache false (not the cache)', async () => {
    vi.mocked(fetchCategories).mockResolvedValue([])

    const { result } = renderHook(() => useCategories(), { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(fetchCategories).toHaveBeenCalled()
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.categories).toEqual([])
    expect(result.current.isFromCache).toBe(false)
  })
})
