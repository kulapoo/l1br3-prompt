import React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'

vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../lib/api', () => ({ fetchPrompts: vi.fn() }))
vi.mock('../lib/storage', () => ({
  getCachedPromptsFor: vi.fn(),
  cachePromptsFor: vi.fn(),
  clearPromptCache: vi.fn(),
}))

import { useAppConfig } from '../contexts/AppConfig'
import { fetchPrompts } from '../lib/api'
import { getCachedPromptsFor, cachePromptsFor, clearPromptCache } from '../lib/storage'
import { usePrompts } from './usePrompts'

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

function makeConfig(overrides: { isInstalled?: boolean; url?: string } = {}): AppConfig {
  return {
    backend: { isInstalled: overrides.isInstalled ?? true, url: overrides.url ?? URL_A },
    ai: {
      localConnected: false,
      activeProvider: null,
      selectedModel: null, availableModels: [],
      providers: [], assignments: { chat: null, transform: null },
    },
    viewMode: 'sidebar',
    quickActions: [],
  }
}

function makeCtx(config: AppConfig) {
  return {
    config,
    updateConfig: vi.fn(),
    setConfig: vi.fn(),
    updateAi: vi.fn(),
    activeTab: 'prompts' as const,
    setActiveTab: vi.fn(),
    editingPrompt: null as Prompt | null,
    setEditingPrompt: vi.fn(),
  }
}

function makeWrapper(config: AppConfig) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedPromptsFor).mockResolvedValue(null)
  vi.mocked(cachePromptsFor).mockResolvedValue(undefined)
  vi.mocked(clearPromptCache).mockResolvedValue(undefined)
  vi.mocked(fetchPrompts).mockResolvedValue({ prompts: [], tags: [], total: 0, page: 1, limit: 20 })
})

describe('usePrompts — offline cache path', () => {
  it('returns isFromCache:true and the cached prompts when backend is offline with a cache hit', async () => {
    const cachedAt = new Date().toISOString()
    vi.mocked(getCachedPromptsFor).mockResolvedValue({
      prompts: [p1, p2], tags: [], cachedAt, backendUrl: URL_A,
    })
    const config = makeConfig({ isInstalled: false })
    vi.mocked(useAppConfig).mockReturnValue(makeCtx(config) as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => usePrompts('', null, null, null), {
      wrapper: makeWrapper(config),
    })

    await waitFor(() => expect(result.current.isFromCache).toBe(true))
    expect(result.current.prompts).toHaveLength(2)
    expect(result.current.cachedAt).toBe(cachedAt)
    expect(fetchPrompts).not.toHaveBeenCalled()
  })

  it('returns isFromCache:false and empty list when backend is offline with no cache', async () => {
    vi.mocked(getCachedPromptsFor).mockResolvedValue(null)
    const config = makeConfig({ isInstalled: false })
    vi.mocked(useAppConfig).mockReturnValue(makeCtx(config) as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => usePrompts('', null, null, null), {
      wrapper: makeWrapper(config),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isFromCache).toBe(false)
    expect(result.current.prompts).toHaveLength(0)
  })

  it('applies client-side tag filter to cached prompts while offline', async () => {
    const devTag = { id: 't1', name: 'dev', color: '#4f46e5' }
    const tagged = { ...p1, tags: [devTag] }
    vi.mocked(getCachedPromptsFor).mockResolvedValue({
      prompts: [tagged, p2], tags: [devTag],
      cachedAt: new Date().toISOString(), backendUrl: URL_A,
    })
    const config = makeConfig({ isInstalled: false })
    vi.mocked(useAppConfig).mockReturnValue(makeCtx(config) as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => usePrompts('', 'dev', null, null), {
      wrapper: makeWrapper(config),
    })

    await waitFor(() => expect(result.current.isFromCache).toBe(true))
    expect(result.current.prompts).toHaveLength(1)
    expect(result.current.prompts[0].id).toBe('1')
  })
})

describe('usePrompts — backend URL change clears stale cache', () => {
  it('calls clearPromptCache and resets cache state when backend URL changes', async () => {
    const configA = makeConfig({ isInstalled: false, url: URL_A })
    const ctxA = makeCtx(configA)
    vi.mocked(useAppConfig).mockReturnValue(ctxA as unknown as ReturnType<typeof useAppConfig>)
    vi.mocked(getCachedPromptsFor).mockResolvedValue({
      prompts: [p1], tags: [], cachedAt: new Date().toISOString(), backendUrl: URL_A,
    })

    const { result, rerender } = renderHook(() => usePrompts('', null, null, null), {
      wrapper: makeWrapper(configA),
    })

    // Wait for initial cache to load.
    await waitFor(() => expect(result.current.prompts).toHaveLength(1))

    // Simulate backend URL change.
    const configB = makeConfig({ isInstalled: false, url: URL_B })
    vi.mocked(useAppConfig).mockReturnValue(
      makeCtx(configB) as unknown as ReturnType<typeof useAppConfig>,
    )
    vi.mocked(getCachedPromptsFor).mockResolvedValue(null)

    act(() => { rerender() })

    await waitFor(() => expect(clearPromptCache).toHaveBeenCalled())
    await waitFor(() => expect(result.current.prompts).toHaveLength(0))
    expect(result.current.isFromCache).toBe(false)
  })
})

describe('usePrompts — online path caches unfiltered results', () => {
  it('writes the cache via cachePromptsFor when fetching without filters', async () => {
    vi.mocked(fetchPrompts).mockResolvedValue({ prompts: [p1, p2], tags: [], total: 2, page: 1, limit: 20 })
    const config = makeConfig({ isInstalled: true })
    vi.mocked(useAppConfig).mockReturnValue(makeCtx(config) as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => usePrompts('', null, null, null), {
      wrapper: makeWrapper(config),
    })

    await waitFor(() => expect(result.current.prompts).toHaveLength(2))
    expect(cachePromptsFor).toHaveBeenCalledWith(URL_A, [p1, p2], [])
    expect(result.current.isFromCache).toBe(false)
  })

  it('does NOT write cache when fetching with an active filter', async () => {
    vi.mocked(fetchPrompts).mockResolvedValue({ prompts: [p1], tags: [], total: 1, page: 1, limit: 20 })
    const config = makeConfig({ isInstalled: true })
    vi.mocked(useAppConfig).mockReturnValue(makeCtx(config) as unknown as ReturnType<typeof useAppConfig>)

    const { result } = renderHook(() => usePrompts('', 'dev', null, null), {
      wrapper: makeWrapper(config),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(cachePromptsFor).not.toHaveBeenCalled()
  })
})
