import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'

vi.mock('../hooks/usePrompts')
vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../lib/api', () => ({
  fetchSuggestions: vi.fn().mockResolvedValue([]),
  recordCopy: vi.fn(),
}))
vi.mock('./SuggestionPanel', () => ({
  SuggestionPanel: () => null,
}))

import { useAppConfig } from '../contexts/AppConfig'
import { usePrompts } from '../hooks/usePrompts'
import * as api from '../lib/api'
import { SuggestionsTab } from './SuggestionsTab'

type UsePromptsReturn = ReturnType<typeof usePrompts>

const mockBrowser = {
  runtime: {
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockRejectedValue(new Error('not available')),
  },
}

// Stub once at module level so the global is present during RTL cleanup (afterEach unmount).
vi.stubGlobal('browser', mockBrowser)

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
  activeTab: 'suggestions' as const,
  setActiveTab: vi.fn(),
  editingPrompt: null as Prompt | null,
  setEditingPrompt: vi.fn(),
}

const emptyPrompts: UsePromptsReturn = {
  prompts: [], tags: [], total: 0, isLoading: false, error: null,
  isFromCache: false, cachedAt: null, refresh: vi.fn(),
}

const mockPrompt: Prompt = {
  id: '1',
  title: 'Test Prompt',
  content: 'This is the prompt content',
  tags: [],
  category: '',
  usageCount: 0,
  lastUsed: null,
  isFavorite: false,
}

const TEXTAREA_PLACEHOLDER = 'Paste text, URL, or code snippet to analyze...'

beforeEach(() => {
  vi.mocked(useAppConfig).mockReturnValue(baseCtx)
  vi.mocked(usePrompts).mockReturnValue(emptyPrompts)
  vi.mocked(api.recordCopy).mockReset()
})

function openPicker() {
  render(React.createElement(SuggestionsTab))
  fireEvent.click(screen.getByRole('button', { name: /from saved/i }))
}

describe('SuggestionsTab — FromSavedPicker', () => {
  it('From Saved button opens overlay with autofocused search input', () => {
    openPicker()
    const searchInput = screen.getByPlaceholderText('Search saved prompts...')
    expect(searchInput).toBeInTheDocument()
    expect(searchInput).toHaveFocus()
  })

  it('shows loading state', () => {
    vi.mocked(usePrompts).mockReturnValue({ ...emptyPrompts, isLoading: true })
    openPicker()
    expect(screen.getByText('Loading prompts…')).toBeInTheDocument()
  })

  it('shows error state', () => {
    vi.mocked(usePrompts).mockReturnValue({ ...emptyPrompts, error: 'Network error' })
    openPicker()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('shows Offline banner when isFromCache is true', () => {
    vi.mocked(usePrompts).mockReturnValue({
      ...emptyPrompts,
      prompts: [mockPrompt],
      isFromCache: true,
      cachedAt: new Date().toISOString(),
    })
    openPicker()
    expect(screen.getByText('Offline — showing cached prompts')).toBeInTheDocument()
  })

  it('shows "No saved prompts yet." when library is empty with no query', () => {
    openPicker()
    expect(screen.getByText('No saved prompts yet.')).toBeInTheDocument()
  })

  it('shows "No prompts match your search." when query is non-empty and results empty', () => {
    openPicker()
    fireEvent.change(screen.getByPlaceholderText('Search saved prompts...'), {
      target: { value: 'xyz' },
    })
    expect(screen.getByText('No prompts match your search.')).toBeInTheDocument()
  })

  it('clicking a prompt row replaces textarea content and closes picker', () => {
    vi.mocked(usePrompts).mockReturnValue({ ...emptyPrompts, prompts: [mockPrompt] })
    openPicker()
    fireEvent.click(screen.getByText('Test Prompt'))
    expect(screen.queryByPlaceholderText('Search saved prompts...')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(TEXTAREA_PLACEHOLDER)).toHaveValue(mockPrompt.content)
  })

  it('Escape closes picker without mutating textarea', () => {
    openPicker()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search saved prompts...')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(TEXTAREA_PLACEHOLDER)).toHaveValue('')
  })

  it('X button closes picker', () => {
    openPicker()
    fireEvent.click(screen.getByRole('button', { name: 'Close picker' }))
    expect(screen.queryByPlaceholderText('Search saved prompts...')).not.toBeInTheDocument()
  })

  it('clicking the backdrop overlay closes picker', () => {
    openPicker()
    fireEvent.click(screen.getByTestId('from-saved-picker'))
    expect(screen.queryByPlaceholderText('Search saved prompts...')).not.toBeInTheDocument()
  })

  it('selecting a prompt does not call recordCopy', () => {
    vi.mocked(usePrompts).mockReturnValue({ ...emptyPrompts, prompts: [mockPrompt] })
    openPicker()
    fireEvent.click(screen.getByText('Test Prompt'))
    expect(api.recordCopy).not.toHaveBeenCalled()
  })

  it('offline state lists cached prompts with banner (AC6)', () => {
    vi.mocked(usePrompts).mockReturnValue({
      ...emptyPrompts,
      prompts: [mockPrompt],
      isFromCache: true,
      cachedAt: new Date().toISOString(),
    })
    openPicker()
    expect(screen.getByText('Offline — showing cached prompts')).toBeInTheDocument()
    expect(screen.getByText('Test Prompt')).toBeInTheDocument()
  })
})
