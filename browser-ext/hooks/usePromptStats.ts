import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppConfig } from '../contexts/AppConfig'
import { fetchPromptStats } from '../lib/api'
import { cacheStats, getCachedStats } from '../lib/storage'
import type { PromptStats } from '../types'

interface UsePromptStatsReturn {
  stats: PromptStats | null
  isLoading: boolean
  isFromCache: boolean
}

/**
 * Returns aggregated prompt statistics. Falls back to a cached snapshot when
 * the backend is offline or the request fails so the admin dashboard still
 * shows something.
 */
export function usePromptStats(): UsePromptStatsReturn {
  const { config } = useAppConfig()
  const [cached, setCached] = useState<PromptStats | null>(null)
  const [cacheLoaded, setCacheLoaded] = useState(false)

  useEffect(() => {
    getCachedStats().then((s) => {
      setCached(s)
      setCacheLoaded(true)
    })
  }, [])

  const query = useQuery({
    queryKey: ['promptStats'],
    queryFn: async () => {
      const result = await fetchPromptStats(config.backend.url)
      cacheStats(result)
      return result
    },
    enabled: config.backend.isInstalled,
    staleTime: 60_000,
  })

  if (query.data) {
    return { stats: query.data, isLoading: false, isFromCache: false }
  }
  const offline = !config.backend.isInstalled || query.isError
  if (offline && cached) {
    return { stats: cached, isLoading: false, isFromCache: true }
  }
  return {
    stats: null,
    isLoading: query.isLoading || !cacheLoaded,
    isFromCache: false,
  }
}
