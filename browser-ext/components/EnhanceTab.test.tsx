import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'

vi.mock('../hooks/usePrompts')
vi.mock('../hooks/usePromptMutations', () => ({
  useCreatePrompt: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))
vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../lib/api', () => ({
  streamEnhance: vi.fn().mockResolvedValue(undefined),
  recordCopy: vi.fn(),
}))

import { useAppConfig } from '../contexts/AppConfig'
import { usePrompts } from '../hooks/usePrompts'
import { useCreatePrompt } from '../hooks/usePromptMutations'
import * as api from '../lib/api'
import { EnhanceTab } from './EnhanceTab'

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

vi.stubGlobal('browser', mockBrowser)

const makeConfig = (overrides?: Partial<AppConfig['ai']>): AppConfig => ({
  backend: { isInstalled: true, url: 'http://localhost:8000' },
  ai: {
    localConnected: true,
    cloudEnabled: false,
    cloudQuotaRemaining: 50,
    cloudQuotaTotal: 50,
    cloudQuotaResetAt: null,
    activeProvider: 'ollama',
    selectedModel: 'llama3:8b',
    availableModels: ['llama3:8b'],
    deviceId: 'test-device',
    ...overrides,
  },
  sync: {
    enabled: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
    userId: null,
    accessToken: null,
    refreshToken: null,
    lastSyncTime: null,
    syncStatus: 'idle',
    syncError: null,
    realtimeStatus: 'idle',
    realtimeError: null,
  },
  viewMode: 'sidebar',
  quickActions: [],
})

const mockMutate = vi.fn()

const baseCtx = {
  config: makeConfig(),
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateSync: vi.fn(),
  activeTab: 'enhance' as const,
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
  tags: [{ id: 't1', name: 'test-tag', color: '#fff' }],
  category: 'work',
  usageCount: 0,
  lastUsed: null,
  isFavorite: false,
}

beforeEach(() => {
  vi.mocked(useAppConfig).mockReturnValue(baseCtx)
  vi.mocked(usePrompts).mockReturnValue(emptyPrompts)
  vi.mocked(useCreatePrompt).mockReturnValue({ mutate: mockMutate, isPending: false } as unknown as ReturnType<typeof useCreatePrompt>)
  vi.mocked(api.streamEnhance).mockResolvedValue(undefined)
  mockMutate.mockReset()
  // Default: a successful save fires onSuccess so navigation assertions hold.
  mockMutate.mockImplementation(
    (_data: unknown, opts?: { onSuccess?: () => void; onError?: (e: Error) => void }) =>
      opts?.onSuccess?.(),
  )
  baseCtx.setActiveTab.mockReset()
  baseCtx.setEditingPrompt.mockReset()
})

// ── Chip selection and enhancement ──────────────────────────────────────────

describe('EnhanceTab — chip selection', () => {
  it('Enhance button is disabled with no input and no mode selected', () => {
    render(<EnhanceTab />)
    expect(screen.getByRole('button', { name: /^enhance$/i })).toBeDisabled()
  })

  it('Enhance button is disabled when input is set but no mode', () => {
    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Hello world' },
    })
    expect(screen.getByRole('button', { name: /^enhance$/i })).toBeDisabled()
  })

  it('Enhance button enables after input + chip selection', () => {
    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Hello world' },
    })
    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    expect(screen.getByRole('button', { name: /^enhance$/i })).not.toBeDisabled()
  })

  it('clicking a chip twice deselects it', () => {
    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Hello' },
    })
    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    expect(screen.getByRole('button', { name: /^enhance$/i })).toBeDisabled()
  })

  it('calls streamEnhance with correct mode when chip is selected and Enhance is clicked', async () => {
    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Describe the sky' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add role/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })
    expect(api.streamEnhance).toHaveBeenCalledWith(
      'http://localhost:8000',
      expect.objectContaining({ prompt: 'Describe the sky', mode: 'add_role' }),
      expect.any(Function),
      expect.any(AbortSignal),
      expect.objectContaining({ deviceId: 'test-device' }),
    )
  })

  it('calls streamEnhance with mode="custom" and instruction when Custom chip is used', async () => {
    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'My prompt' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^custom$/i }))
    fireEvent.change(screen.getByPlaceholderText(/describe how to improve/i), {
      target: { value: 'Add emojis' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })
    expect(api.streamEnhance).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mode: 'custom', instruction: 'Add emojis' }),
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Object),
    )
  })
})

// ── Streaming result panel ───────────────────────────────────────────────────

describe('EnhanceTab — streaming result', () => {
  it('renders streamed chunks in the result panel', async () => {
    vi.mocked(api.streamEnhance).mockImplementation(async (_url, _body, onChunk) => {
      onChunk('improved ')
      onChunk('prompt')
    })

    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Original' },
    })
    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })

    expect(screen.getByText('improved prompt')).toBeInTheDocument()
  })

  it('shows original prompt above the enhanced result', async () => {
    vi.mocked(api.streamEnhance).mockImplementation(async (_url, _body, onChunk) => {
      onChunk('enhanced text')
    })

    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Original prompt text' },
    })
    fireEvent.click(screen.getByRole('button', { name: /summarize/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })

    // Both the textarea value and the result pre hold the original text — check the pre
    expect(screen.getByText('Original prompt text', { selector: 'pre' })).toBeInTheDocument()
    expect(screen.getByText('enhanced text', { selector: 'pre' })).toBeInTheDocument()
  })

  it('shows Use this / Save as new / Copy / Retry after streaming completes', async () => {
    vi.mocked(api.streamEnhance).mockImplementation(async (_url, _body, onChunk) => {
      onChunk('result')
    })

    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Input' },
    })
    fireEvent.click(screen.getByRole('button', { name: /concise/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })

    expect(screen.getByRole('button', { name: /use this/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save as new/i })).toBeInTheDocument()
    expect(screen.getByTitle('Copy to clipboard')).toBeInTheDocument()
    expect(screen.getByTitle('Retry')).toBeInTheDocument()
  })
})

// ── Use this / Save as new ───────────────────────────────────────────────────

describe('EnhanceTab — actions', () => {
  it('"Use this" calls setEditingPrompt with enhanced content and navigates to compose', async () => {
    vi.mocked(api.streamEnhance).mockImplementation(async (_url, _body, onChunk) => {
      onChunk('improved prompt')
    })

    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Original' },
    })
    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /use this/i }))
    expect(baseCtx.setEditingPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'improved prompt' }),
    )
    expect(baseCtx.setActiveTab).toHaveBeenCalledWith('compose')
  })

  it('"Save as new" with no source prompt uses generic title and navigates to prompts', async () => {
    vi.mocked(api.streamEnhance).mockImplementation(async (_url, _body, onChunk) => {
      onChunk('enhanced')
    })

    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Some input' },
    })
    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /save as new/i }))
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Enhanced prompt', content: 'enhanced' }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(baseCtx.setActiveTab).toHaveBeenCalledWith('prompts')
  })

  it('"Save as new" with source prompt inherits title, category, and tags', async () => {
    vi.mocked(api.streamEnhance).mockImplementation(async (_url, _body, onChunk) => {
      onChunk('better version')
    })
    vi.mocked(usePrompts).mockReturnValue({ ...emptyPrompts, prompts: [mockPrompt] })

    render(<EnhanceTab />)
    // Open picker and select the mock prompt
    fireEvent.click(screen.getByRole('button', { name: /from saved/i }))
    fireEvent.click(screen.getByText('Test Prompt'))

    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /save as new/i }))
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Test Prompt (enhanced)',
        content: 'better version',
        category: 'work',
        tags: [{ name: 'test-tag' }],
      }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('"Save as new" stays on Enhance and surfaces an error when the save fails', async () => {
    vi.mocked(api.streamEnhance).mockImplementation(async (_url, _body, onChunk) => {
      onChunk('enhanced')
    })
    mockMutate.mockImplementation(
      (_data: unknown, opts?: { onError?: (e: Error) => void }) =>
        opts?.onError?.(new Error('disk full')),
    )

    render(<EnhanceTab />)
    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Some input' },
    })
    fireEvent.click(screen.getByRole('button', { name: /best judgement/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^enhance$/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /save as new/i }))
    expect(screen.getByText('disk full')).toBeInTheDocument()
    expect(baseCtx.setActiveTab).not.toHaveBeenCalledWith('prompts')
  })
})

// ── AI unavailable ───────────────────────────────────────────────────────────

describe('EnhanceTab — AI unavailable', () => {
  it('shows amber banner and disables Enhance when no AI is available', () => {
    vi.mocked(useAppConfig).mockReturnValue({
      ...baseCtx,
      config: makeConfig({ availableModels: [], cloudEnabled: false }),
    })

    render(<EnhanceTab />)
    expect(screen.getByText('AI Not Available')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/type a prompt/i), {
      target: { value: 'Hello' },
    })
    // Even with input, Enhance should be disabled
    expect(screen.getByRole('button', { name: /^enhance$/i })).toBeDisabled()
  })

  it('does not show the banner when backend has models', () => {
    render(<EnhanceTab />)
    expect(screen.queryByText('AI Not Available')).not.toBeInTheDocument()
  })

  it('does not show the banner when cloud is enabled (even with no local models)', () => {
    vi.mocked(useAppConfig).mockReturnValue({
      ...baseCtx,
      config: makeConfig({ availableModels: [], cloudEnabled: true }),
    })
    render(<EnhanceTab />)
    expect(screen.queryByText('AI Not Available')).not.toBeInTheDocument()
  })
})

// ── FromSavedPicker ──────────────────────────────────────────────────────────

describe('EnhanceTab — FromSavedPicker', () => {
  function openPicker() {
    render(<EnhanceTab />)
    fireEvent.click(screen.getByRole('button', { name: /from saved/i }))
  }

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

  it('selecting a prompt loads its content into the textarea and closes picker', () => {
    vi.mocked(usePrompts).mockReturnValue({ ...emptyPrompts, prompts: [mockPrompt] })
    openPicker()
    fireEvent.click(screen.getByText('Test Prompt'))
    expect(screen.queryByPlaceholderText('Search saved prompts...')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/type a prompt/i)).toHaveValue(mockPrompt.content)
  })

  it('Escape closes picker without mutating textarea', () => {
    openPicker()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Search saved prompts...')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/type a prompt/i)).toHaveValue('')
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

  it('offline state lists cached prompts with banner', () => {
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
