import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppConfig } from '../contexts/AppConfig'
import { fetchCategories } from '../lib/api'
import { cacheCategories, getCachedCategories } from '../lib/storage'

interface UseCategoriesReturn {
  categories: string[]
  isLoading: boolean
  isFromCache: boolean
}

/**
 * Returns distinct prompt categories. Falls back to cached values when the
 * backend is offline so the UI can still render a dropdown.
 */
export function useCategories(): UseCategoriesReturn {
  const { config } = useAppConfig()
  const [cached, setCached] = useState<string[] | null>(null)

  useEffect(() => {
    getCachedCategories().then((c) => setCached(c))
  }, [])

  const query = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const result = await fetchCategories(config.backend.url)
      cacheCategories(result)
      return result
    },
    enabled: config.backend.isInstalled,
  })

  if (query.data) {
    return { categories: query.data, isLoading: false, isFromCache: false }
  }
  return {
    categories: cached ?? [],
    isLoading: query.isLoading,
    isFromCache: !config.backend.isInstalled || (cached?.length ?? 0) > 0,
  }
}
