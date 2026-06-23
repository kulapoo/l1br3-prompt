import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { AppConfig } from '../contexts/AppConfig'
import type { Prompt } from '../types'
import type { RealtimeSyncOptions } from '../lib/realtime'

vi.mock('../contexts/AppConfig', () => ({ useAppConfig: vi.fn() }))
vi.mock('../lib/supabase', () => ({ createSupabaseClient: vi.fn().mockReturnValue({}) }))
vi.mock('../lib/realtime', () => ({ RealtimeSyncService: vi.fn() }))

import { useAppConfig } from '../contexts/AppConfig'
import { RealtimeSyncService } from '../lib/realtime'
import { useRealtimeSync } from './useRealtimeSync'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc'
const SUPABASE_URL = 'https://project.supabase.co'
const SUPABASE_KEY = 'anon-key'
const ACCESS_TOKEN = 'access-tok'
const REFRESH_TOKEN = 'refresh-tok'

const baseSyncConfig: AppConfig['sync'] = {
  enabled: true,
  supabaseUrl: SUPABASE_URL,
  supabaseAnonKey: SUPABASE_KEY,
  userId: USER_ID,
  accessToken: ACCESS_TOKEN,
  refreshToken: REFRESH_TOKEN,
  lastSyncTime: null,
  syncStatus: 'idle',
  syncError: null,
  realtimeStatus: 'idle',
  realtimeError: null,
}

const mockConfig: AppConfig = {
  backend: { isInstalled: true, url: 'http://localhost:8000' },
  ai: {
    localConnected: false,
    cloudEnabled: false,
    cloudQuotaRemaining: 0,
    cloudQuotaTotal: 0,
    cloudQuotaResetAt: null,
    activeProvider: null,
    selectedModel: null,
    availableModels: [],
    deviceId: null,
    providers: [], assignments: { chat: null, transform: null },
  },
  sync: baseSyncConfig,
  viewMode: 'sidebar',
  quickActions: [],
}

const mockUpdateSync = vi.fn()

const baseCtx = {
  config: mockConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateSync: mockUpdateSync,
  updateAi: vi.fn(),
  activeTab: 'compose' as const,
  setActiveTab: vi.fn(),
  editingPrompt: null as Prompt | null,
  setEditingPrompt: vi.fn(),
}

// ── Mock service instance ─────────────────────────────────────────────────────

const mockStart = vi.fn().mockResolvedValue(undefined)
const mockStop = vi.fn().mockResolvedValue(undefined)
let capturedOpts: RealtimeSyncOptions | null = null

// ── Wrapper factory ───────────────────────────────────────────────────────────

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(client, 'invalidateQueries').mockImplementation(() => Promise.resolve())
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
  return { wrapper, client }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedOpts = null
  vi.clearAllMocks()
  vi.mocked(RealtimeSyncService).mockImplementation((opts) => {
    capturedOpts = opts
    return { start: mockStart, stop: mockStop } as unknown as RealtimeSyncService
  })
  vi.mocked(useAppConfig).mockReturnValue(
    baseCtx as unknown as ReturnType<typeof useAppConfig>,
  )
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useRealtimeSync', () => {
  describe('service lifecycle — when to start', () => {
    it('constructs and starts the service when all credentials are present', async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1))
      expect(RealtimeSyncService).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['enabled = false', { enabled: false }],
      ['userId = null', { userId: null }],
      ['accessToken = null', { accessToken: null }],
      ['supabaseUrl = empty string', { supabaseUrl: '' }],
      ['supabaseAnonKey = empty string', { supabaseAnonKey: '' }],
    ])('does not start when %s', async (_label, syncOverride) => {
      vi.mocked(useAppConfig).mockReturnValue({
        ...baseCtx,
        config: {
          ...mockConfig,
          sync: { ...baseSyncConfig, ...syncOverride },
        },
      } as unknown as ReturnType<typeof useAppConfig>)

      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })

      // Give effects time to settle
      await new Promise(r => setTimeout(r, 10))
      expect(RealtimeSyncService).not.toHaveBeenCalled()
    })
  })

  describe('service lifecycle — when to re-create', () => {
    it('re-creates service when userId changes', async () => {
      const { wrapper } = makeWrapper()
      const { rerender } = renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(RealtimeSyncService).toHaveBeenCalledTimes(1))

      vi.mocked(useAppConfig).mockReturnValue({
        ...baseCtx,
        config: { ...mockConfig, sync: { ...baseSyncConfig, userId: 'new-uid' } },
      } as unknown as ReturnType<typeof useAppConfig>)
      rerender()

      await waitFor(() => expect(RealtimeSyncService).toHaveBeenCalledTimes(2))
      expect(mockStop).toHaveBeenCalledTimes(1) // old service stopped first
    })

    it('re-creates service when supabaseUrl changes', async () => {
      const { wrapper } = makeWrapper()
      const { rerender } = renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(RealtimeSyncService).toHaveBeenCalledTimes(1))

      vi.mocked(useAppConfig).mockReturnValue({
        ...baseCtx,
        config: {
          ...mockConfig,
          sync: { ...baseSyncConfig, supabaseUrl: 'https://other.supabase.co' },
        },
      } as unknown as ReturnType<typeof useAppConfig>)
      rerender()

      await waitFor(() => expect(RealtimeSyncService).toHaveBeenCalledTimes(2))
    })

    it('does NOT re-create service when only accessToken changes', async () => {
      const { wrapper } = makeWrapper()
      const { rerender } = renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(RealtimeSyncService).toHaveBeenCalledTimes(1))

      vi.mocked(useAppConfig).mockReturnValue({
        ...baseCtx,
        config: {
          ...mockConfig,
          sync: { ...baseSyncConfig, accessToken: 'refreshed-token' },
        },
      } as unknown as ReturnType<typeof useAppConfig>)
      rerender()

      await new Promise(r => setTimeout(r, 10))
      expect(RealtimeSyncService).toHaveBeenCalledTimes(1) // still 1
    })

    it('does NOT re-create service when only refreshToken changes', async () => {
      const { wrapper } = makeWrapper()
      const { rerender } = renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(RealtimeSyncService).toHaveBeenCalledTimes(1))

      vi.mocked(useAppConfig).mockReturnValue({
        ...baseCtx,
        config: {
          ...mockConfig,
          sync: { ...baseSyncConfig, refreshToken: 'refreshed-refresh' },
        },
      } as unknown as ReturnType<typeof useAppConfig>)
      rerender()

      await new Promise(r => setTimeout(r, 10))
      expect(RealtimeSyncService).toHaveBeenCalledTimes(1)
    })

    it('stops service on unmount', async () => {
      const { wrapper } = makeWrapper()
      const { unmount } = renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(mockStart).toHaveBeenCalled())

      unmount()
      await waitFor(() => expect(mockStop).toHaveBeenCalledTimes(1))
    })
  })

  describe('onEvent callback', () => {
    it('invalidates both [prompts] and [categories] query keys', async () => {
      const { wrapper, client } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onEvent({ op: 'update', id: 'p-1' })
      })

      expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['prompts'] })
      expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['categories'] })
    })
  })

  describe('onStateChange callback', () => {
    it("'live' state → realtimeStatus: 'live' and lastSyncTime written", async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onStateChange({ kind: 'live' })
      })

      expect(mockUpdateSync).toHaveBeenCalledWith(
        expect.objectContaining({
          realtimeStatus: 'live',
          realtimeError: null,
          lastSyncTime: expect.any(String),
        }),
      )
    })

    it("'connecting' state → realtimeStatus: 'connecting'", async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onStateChange({ kind: 'connecting' })
      })

      expect(mockUpdateSync).toHaveBeenCalledWith({ realtimeStatus: 'connecting', realtimeError: null })
    })

    it("'catching_up' state → realtimeStatus: 'connecting'", async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onStateChange({ kind: 'catching_up' })
      })

      expect(mockUpdateSync).toHaveBeenCalledWith({ realtimeStatus: 'connecting', realtimeError: null })
    })

    it("'reconnecting' state → realtimeStatus: 'reconnecting'", async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onStateChange({ kind: 'reconnecting', attempt: 1 })
      })

      expect(mockUpdateSync).toHaveBeenCalledWith({ realtimeStatus: 'reconnecting', realtimeError: null })
    })

    it("'error' state → realtimeStatus: 'error' with realtimeError set", async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onStateChange({ kind: 'error', message: 'something went wrong' })
      })

      expect(mockUpdateSync).toHaveBeenCalledWith({
        realtimeStatus: 'error',
        realtimeError: 'something went wrong',
      })
    })

    it("'closed' state → realtimeStatus: 'idle'", async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onStateChange({ kind: 'closed' })
      })

      expect(mockUpdateSync).toHaveBeenCalledWith({ realtimeStatus: 'idle', realtimeError: null })
    })
  })

  describe('onTokenRefreshed callback', () => {
    it('persists new access and refresh tokens via updateSync', async () => {
      const { wrapper } = makeWrapper()
      renderHook(() => useRealtimeSync(), { wrapper })
      await waitFor(() => expect(capturedOpts).not.toBeNull())

      act(() => {
        capturedOpts!.onTokenRefreshed({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
        } as Parameters<RealtimeSyncOptions['onTokenRefreshed']>[0])
      })

      expect(mockUpdateSync).toHaveBeenCalledWith({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      })
    })
  })
})
