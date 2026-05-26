import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAppConfig } from '../contexts/AppConfig'
import { createSupabaseClient } from '../lib/supabase'
import { RealtimeSyncService, RealtimeState } from '../lib/realtime'

export function useRealtimeSync(): void {
  const { config, updateSync } = useAppConfig()
  const queryClient = useQueryClient()

  // Always call the latest updateSync without making it a dep (avoids restart loop)
  const updateSyncRef = useRef(updateSync)
  updateSyncRef.current = updateSync

  const { enabled, userId, accessToken, refreshToken, supabaseUrl, supabaseAnonKey, lastSyncTime } =
    config.sync
  const backendUrl = config.backend.url

  useEffect(() => {
    if (!enabled || !userId || !accessToken || !supabaseUrl || !supabaseAnonKey) return

    const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)

    const service = new RealtimeSyncService({
      supabase,
      backendUrl,
      accessToken,
      refreshToken,
      userId,
      lastSyncTime,
      onEvent: () => {
        queryClient.invalidateQueries({ queryKey: ['prompts'] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
      },
      onStateChange: (state: RealtimeState) => {
        switch (state.kind) {
          case 'connecting':
          case 'catching_up':
            updateSyncRef.current({ realtimeStatus: 'connecting', realtimeError: null })
            break
          case 'live':
            updateSyncRef.current({
              realtimeStatus: 'live',
              realtimeError: null,
              lastSyncTime: new Date().toISOString(),
            })
            break
          case 'reconnecting':
            updateSyncRef.current({ realtimeStatus: 'reconnecting', realtimeError: null })
            break
          case 'error':
            updateSyncRef.current({ realtimeStatus: 'error', realtimeError: state.message })
            break
          case 'closed':
            updateSyncRef.current({ realtimeStatus: 'idle', realtimeError: null })
            break
        }
      },
      onTokenRefreshed: (session) => {
        updateSyncRef.current({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        })
      },
    })

    void service.start()

    return () => {
      void service.stop()
    }
    // Re-mount only when credentials or endpoint fundamentally change.
    // accessToken/refreshToken are intentionally omitted: the service manages
    // token refresh internally and persists new tokens via onTokenRefreshed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, supabaseUrl, supabaseAnonKey, backendUrl])
}
