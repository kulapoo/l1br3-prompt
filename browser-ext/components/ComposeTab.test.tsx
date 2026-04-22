import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'

// Minimal editor mock: non-null so pre-fill useEffect runs past the `if (!editor)` guard
const chainEnd = { run: vi.fn() }
const chainFocus: Record<string, () => typeof chainEnd> = new Proxy({}, {
  get: () => () => chainFocus,
})
Object.assign(chainFocus, { run: vi.fn() })

const mockEditor = {
  commands: { setContent: vi.fn(), clearContent: vi.fn() },
  chain: () => chainFocus,
  isActive: () => false,
  state: { selection: { from: 0, to: 0 }, doc: { textBetween: () => '' } },
  getHTML: () => '<p>Updated content</p>',
  getText: () => 'Updated content',
  isEmpty: false,
}

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockEditor,
  EditorContent: () => React.createElement('div', { 'data-testid': 'tiptap-editor' }),
}))

vi.mock('@tiptap/starter-kit', () => ({ default: { configure: () => ({}) } }))
vi.mock('@tiptap/extension-placeholder', () => ({ default: { configure: () => ({}) } }))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => React.createElement('div', props, children) },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

vi.mock('../lib/api', () => ({
  streamGenerate: vi.fn(),
  QuotaExceededError: class extends Error {},
  processTemplate: vi.fn(),
}))

vi.mock('../lib/compose', () => ({ composePromptFor: vi.fn() }))

vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../hooks/usePromptMutations', () => ({
  useCreatePrompt: vi.fn(),
  useUpdatePrompt: vi.fn(),
}))

import { useAppConfig } from '../contexts/AppConfig'
import * as mutations from '../hooks/usePromptMutations'
import { ComposeTab } from './ComposeTab'

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

const editingPrompt: Prompt = {
  id: '42',
  title: 'My Prompt',
  content: '<p>Hello</p>',
  tags: [{ id: 'tag-1', name: 'test-tag', color: '#fff' }],
  category: '',
  usageCount: 0,
  lastUsed: null,
  isFavorite: false,
}

const updateMutate = vi.fn()
const createMutate = vi.fn()

const baseContext = {
  config: mockConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateSync: vi.fn(),
  activeTab: 'compose' as const,
  setActiveTab: vi.fn(),
  editingPrompt: null as Prompt | null,
  setEditingPrompt: vi.fn(),
}

beforeEach(() => {
  vi.mocked(mutations.useCreatePrompt).mockReturnValue({ mutate: createMutate, isPending: false } as unknown as ReturnType<typeof mutations.useCreatePrompt>)
  vi.mocked(mutations.useUpdatePrompt).mockReturnValue({ mutate: updateMutate, isPending: false } as unknown as ReturnType<typeof mutations.useUpdatePrompt>)
  createMutate.mockReset()
  updateMutate.mockReset()
})

describe('ComposeTab — edit mode', () => {
  it('renders Edit Prompt header and Update button when editingPrompt is set', () => {
    vi.mocked(useAppConfig).mockReturnValue({ ...baseContext, editingPrompt })

    render(React.createElement(ComposeTab))

    expect(screen.getByText('Edit Prompt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('My Prompt')).toBeInTheDocument()
  })

  it('calls updateMutation (not createMutation) when Update is clicked in edit mode', () => {
    vi.mocked(useAppConfig).mockReturnValue({ ...baseContext, editingPrompt })

    render(React.createElement(ComposeTab))

    fireEvent.click(screen.getByRole('button', { name: /update/i }))

    expect(updateMutate).toHaveBeenCalledOnce()
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: '42' }),
      expect.any(Object),
    )
    expect(createMutate).not.toHaveBeenCalled()
  })
})
