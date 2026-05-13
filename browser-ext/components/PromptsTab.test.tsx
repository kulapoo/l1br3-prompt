import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'

vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../hooks/usePrompts', () => ({ usePrompts: vi.fn() }))
vi.mock('../hooks/useCategories', () => ({ useCategories: vi.fn() }))
vi.mock('../hooks/usePromptMutations', () => ({ usePromptMutations: vi.fn() }))
vi.mock('./PromptCard', () => ({
  PromptCard: ({ prompt }: { prompt: Prompt }) =>
    React.createElement('div', { 'data-testid': 'prompt-card' }, prompt.title),
}))
vi.mock('../lib/insertIntoActiveTab', () => ({ insertIntoActiveTab: vi.fn() }))
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

import { useAppConfig } from '../contexts/AppConfig'
import { usePrompts } from '../hooks/usePrompts'
import { useCategories } from '../hooks/useCategories'
import { usePromptMutations } from '../hooks/usePromptMutations'
import { PromptsTab } from './PromptsTab'

type UsePromptsReturn = ReturnType<typeof usePrompts>

const mockConfig: AppConfig = {
  backend: { isInstalled: true, url: 'http://localhost:8000' },
  ai: {
    localConnected: false, cloudEnabled: false, cloudQuotaRemaining: 0,
    cloudQuotaTotal: 0, cloudQuotaResetAt: null, activeProvider: null,
    selectedModel: null, availableModels: [], deviceId: null,
  },
  sync: {
    enabled: false, supabaseUrl: '', supabaseAnonKey: '', userId: null,
    accessToken: null, refreshToken: null, lastSyncTime: null,
    syncStatus: 'idle', syncError: null,
  },
  viewMode: 'sidebar',
  quickActions: [],
}

const baseCtx = {
  config: mockConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateSync: vi.fn(),
  activeTab: 'prompts' as const,
  setActiveTab: vi.fn(),
  editingPrompt: null as Prompt | null,
  setEditingPrompt: vi.fn(),
}

const emptyPromptsReturn: UsePromptsReturn = {
  prompts: [], tags: [], total: 0, isLoading: false, error: null,
  isFromCache: false, cachedAt: null, refresh: vi.fn(),
}

const mockMutations = {
  deleteMutation: { error: null, reset: vi.fn(), mutate: vi.fn() },
  toggleFavoriteMutation: { error: null, reset: vi.fn(), mutate: vi.fn() },
  recordCopyMutation: { error: null, reset: vi.fn(), mutate: vi.fn() },
}

beforeEach(() => {
  vi.mocked(useAppConfig).mockReturnValue(baseCtx as unknown as ReturnType<typeof useAppConfig>)
  vi.mocked(usePrompts).mockReturnValue(emptyPromptsReturn)
  vi.mocked(useCategories).mockReturnValue({ categories: ['Writing', 'Code'], isLoading: false, isFromCache: false })
  vi.mocked(usePromptMutations).mockReturnValue(mockMutations as unknown as ReturnType<typeof usePromptMutations>)
})

describe('PromptsTab — category filter pills', () => {
  it('renders one filter pill per category from useCategories', () => {
    render(React.createElement(PromptsTab))

    expect(screen.getByRole('button', { name: 'Writing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument()
  })

  it('clicking a category pill activates it (emerald-500 class) and passes it as 4th arg to usePrompts', () => {
    render(React.createElement(PromptsTab))

    fireEvent.click(screen.getByRole('button', { name: 'Writing' }))

    expect(screen.getByRole('button', { name: 'Writing' })).toHaveClass('bg-emerald-500')
    const lastCall = vi.mocked(usePrompts).mock.calls.at(-1)!
    expect(lastCall[3]).toBe('Writing')
  })

  it('clicking the same pill twice clears the filter (toggle off)', () => {
    render(React.createElement(PromptsTab))

    fireEvent.click(screen.getByRole('button', { name: 'Writing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Writing' }))

    expect(screen.getByRole('button', { name: 'Writing' })).not.toHaveClass('bg-emerald-500')
    const lastCall = vi.mocked(usePrompts).mock.calls.at(-1)!
    expect(lastCall[3]).toBeNull()
  })

  it('clicking "All" clears category, tag, and favorites filters simultaneously', () => {
    render(React.createElement(PromptsTab))

    fireEvent.click(screen.getByRole('button', { name: 'Writing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    const lastCall = vi.mocked(usePrompts).mock.calls.at(-1)!
    expect(lastCall[1]).toBeNull()  // tagFilter
    expect(lastCall[2]).toBeNull()  // favoriteFilter (showFavoritesOnly false → null)
    expect(lastCall[3]).toBeNull()  // categoryFilter
    expect(screen.getByRole('button', { name: 'All' })).toHaveClass('bg-slate-200')
  })

  it('renders no category pills and no divider when useCategories returns []', () => {
    vi.mocked(useCategories).mockReturnValue({ categories: [], isLoading: false, isFromCache: false })

    render(React.createElement(PromptsTab))

    expect(screen.queryByRole('button', { name: 'Writing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Code' })).not.toBeInTheDocument()
    // No category divider — only All and Favorites filter buttons are visible
    const filterButtons = screen.getAllByRole('button').filter(
      (b) => ['All', 'Favorites'].includes(b.textContent ?? ''),
    )
    expect(filterButtons).toHaveLength(2)
  })
})
