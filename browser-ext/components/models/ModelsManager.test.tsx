import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../../contexts/AppConfig'
import type { Prompt } from '../../types'

vi.mock('../../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
}))

import { useAppConfig } from '../../contexts/AppConfig'
import { ModelsManager } from './ModelsManager'

function makeConfig(overrides: Partial<AppConfig['ai']> = {}): AppConfig {
  return {
    backend: { isInstalled: true, url: 'http://localhost:8000' },
    ai: {
      localConnected: true,
      cloudEnabled: false,
      cloudQuotaRemaining: 50,
      cloudQuotaTotal: 50,
      cloudQuotaResetAt: null,
      activeProvider: null,
      selectedModel: null,
      availableModels: ['llama3:8b'],
      deviceId: null,
      providers: [],
      assignments: { chat: null, transform: null },
      ...overrides,
    },
    sync: {
      enabled: false, supabaseUrl: '', supabaseAnonKey: '', userId: null,
      accessToken: null, refreshToken: null, lastSyncTime: null,
      syncStatus: 'idle', syncError: null, realtimeStatus: 'idle', realtimeError: null,
    },
    viewMode: 'admin',
    quickActions: [],
  }
}

const updateAi = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
})

function renderManager(config: AppConfig) {
  vi.mocked(useAppConfig).mockReturnValue({
    config,
    updateAi,
    updateConfig: vi.fn(),
    setConfig: vi.fn(),
    updateSync: vi.fn(),
    activeTab: 'compose',
    setActiveTab: vi.fn(),
    editingPrompt: null as Prompt | null,
    setEditingPrompt: vi.fn(),
  } as unknown as ReturnType<typeof useAppConfig>)
  return render(<ModelsManager />)
}

describe('ModelsManager', () => {
  it('renders the page header and both sections', () => {
    renderManager(makeConfig())
    expect(screen.getByText('Configure your AI with your own API keys')).toBeInTheDocument()
    expect(screen.getByText('Default Model Assignments')).toBeInTheDocument()
    expect(screen.getByText('Provider Configuration')).toBeInTheDocument()
  })

  it('shows the fixed Ollama and Free Cloud cards plus 3 addable empty cards', () => {
    renderManager(makeConfig())
    expect(screen.getByText('Ollama (Local)')).toBeInTheDocument()
    expect(screen.getByText('Free Cloud (Groq / Gemini)')).toBeInTheDocument()
    // Three BYOK provider types with no config -> each offers Add Configuration.
    expect(screen.getAllByRole('button', { name: /add configuration/i })).toHaveLength(3)
  })

  it('warns when required default models are missing', () => {
    renderManager(makeConfig({ assignments: { chat: null, transform: null } }))
    expect(screen.getByText(/missing required models/i)).toBeInTheDocument()
  })

  it('does not warn when both required roles are assigned', () => {
    renderManager(
      makeConfig({
        assignments: {
          chat: { providerId: 'ollama', model: 'llama3:8b' },
          transform: { providerId: 'ollama', model: 'llama3:8b' },
        },
      }),
    )
    expect(screen.queryByText(/missing required models/i)).not.toBeInTheDocument()
  })

  it('auto-assigns the first available model to unset roles', () => {
    renderManager(makeConfig())
    fireEvent.click(screen.getByRole('button', { name: /auto-assign defaults/i }))
    expect(updateAi).toHaveBeenCalledWith({
      assignments: {
        chat: { providerId: 'ollama', model: 'llama3:8b' },
        transform: { providerId: 'ollama', model: 'llama3:8b' },
      },
    })
  })

  it('opens the add-provider modal when Add Configuration is clicked', () => {
    renderManager(makeConfig())
    const addButtons = screen.getAllByRole('button', { name: /add configuration/i })
    fireEvent.click(addButtons[0])
    // Modal-only elements: the Cancel action and the Capabilities field label.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByText('Capabilities')).toBeInTheDocument()
  })

  it('renders a configured BYOK provider as a Configured card', () => {
    renderManager(
      makeConfig({
        providers: [
          {
            id: 'p1',
            type: 'openai',
            label: 'OpenAI',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            enabled: true,
            capabilities: ['language'],
            models: ['gpt-4o'],
            configured: true,
          },
        ],
        assignments: {
          chat: { providerId: 'p1', model: 'gpt-4o' },
          transform: { providerId: 'p1', model: 'gpt-4o' },
        },
      }),
    )
    // Configured badge present, and a removable model pill for gpt-4o.
    expect(screen.getAllByText(/configured/i).length).toBeGreaterThan(0)
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    // Configured cards show Edit + Delete actions.
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete configuration/i })).toBeInTheDocument()
  })

  it('removes a provider and clears assignments pointing at it on delete', () => {
    renderManager(
      makeConfig({
        providers: [
          {
            id: 'p1',
            type: 'openai',
            label: 'OpenAI',
            baseUrl: null,
            apiKey: 'sk-test',
            enabled: true,
            capabilities: ['language'],
            models: ['gpt-4o'],
            configured: true,
          },
        ],
        assignments: {
          chat: { providerId: 'p1', model: 'gpt-4o' },
          transform: null,
        },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /delete configuration/i }))
    expect(updateAi).toHaveBeenCalledWith({
      providers: [],
      assignments: { chat: null, transform: null },
    })
  })
})
