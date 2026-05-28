import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'

vi.mock('../contexts/AppConfig', () => ({
  useAppConfig: vi.fn(),
  // Pass-through types referenced in the source
  QuickActionSource: {},
}))
vi.mock('../lib/api', () => ({
  fetchAiStatus: vi.fn().mockResolvedValue({
    ollama: { reachable: false, models: [] },
    provider: null,
  }),
  pingBackend: vi.fn().mockResolvedValue(false),
}))
vi.mock('../lib/supabase', () => ({
  createSupabaseClient: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  getRedirectUri: vi.fn(),
}))
vi.mock('../lib/sync', () => ({ SyncService: vi.fn() }))
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

import { useAppConfig } from '../contexts/AppConfig'
import { SettingsTab } from './SettingsTab'

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
    syncStatus: 'idle', syncError: null, realtimeStatus: 'idle', realtimeError: null,
  },
  viewMode: 'sidebar',
  quickActions: [],
}

const ctx = {
  config: mockConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateSync: vi.fn(),
  activeTab: 'settings' as const,
  setActiveTab: vi.fn(),
  editingPrompt: null as Prompt | null,
  setEditingPrompt: vi.fn(),
}

const browserMock = {
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAppConfig).mockReturnValue(ctx as unknown as ReturnType<typeof useAppConfig>)
  ;(globalThis as unknown as { browser: typeof browserMock }).browser = browserMock
})

describe('SettingsTab — Open Admin Mode', () => {
  it('sends OPEN_ADMIN runtime message when button is clicked', () => {
    render(<SettingsTab />)
    fireEvent.click(screen.getByRole('button', { name: /open admin mode/i }))
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_ADMIN' })
  })
})
