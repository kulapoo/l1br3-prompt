import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppConfig } from '../contexts/AppConfig'
import { fetchPrompts } from '../lib/api'
import { cachePrompts, getCachedPrompts } from '../lib/storage'
import { useDebounce } from './useDebounce'
import type { Prompt, Tag } from '../types'

interface UsePromptsReturn {
  prompts: Prompt[]
  tags: Tag[]
  total: number
  isLoading: boolean
  error: string | null
  /** True when the displayed prompts came from the offline cache, not the live backend. */
  isFromCache: boolean
  /** ISO timestamp of the cache entry (only meaningful when isFromCache is true). */
  cachedAt: string | null
  refresh: () => void
}

export function usePrompts(
  search: string,
  tagFilter: string | null,
  favoriteFilter: boolean | null,
  categoryFilter: string | null = null,
): UsePromptsReturn {
  const { config } = useAppConfig()
  const debouncedSearch = useDebounce(search, 300)

  const [cache, setCache] = useState<{ prompts: Prompt[]; tags: Tag[]; cachedAt: string } | null>(
    null,
  )

  // Load cache once on mount so offline users see something immediately.
  useEffect(() => {
    getCachedPrompts().then((entry) => {
      if (entry) setCache(entry)
    })
  }, [])

  const query = useQuery({
    queryKey: [
      'prompts',
      {
        search: debouncedSearch,
        tag: tagFilter,
        category: categoryFilter,
        favorite: favoriteFilter,
      },
    ],
    queryFn: async () => {
      const result = await fetchPrompts(config.backend.url, {
        search: debouncedSearch || undefined,
        tag: tagFilter ?? undefined,
        category: categoryFilter ?? undefined,
        favorite: favoriteFilter ?? undefined,
      })
      // Only cache the unfiltered "home view" — filtered results would mislead
      // an offline user into thinking the cache is incomplete.
      if (!debouncedSearch && !tagFilter && !categoryFilter && favoriteFilter == null) {
        cachePrompts(result.prompts, result.tags)
        setCache({ prompts: result.prompts, tags: result.tags, cachedAt: new Date().toISOString() })
      }
      return result
    },
    enabled: config.backend.isInstalled,
  })

  if (query.data) {
    return {
      prompts: query.data.prompts,
      tags: query.data.tags,
      total: query.data.total,
      isLoading: false,
      error: query.error ? String(query.error) : null,
      isFromCache: false,
      cachedAt: null,
      refresh: () => {
        query.refetch()
      },
    }
  }

  // No live data yet — use cache so the UI isn't empty while offline.
  if (cache) {
    const filtered = applyClientFilters(cache.prompts, {
      search: debouncedSearch,
      tag: tagFilter,
      category: categoryFilter,
      favorite: favoriteFilter,
    })
    return {
      prompts: filtered,
      tags: cache.tags,
      total: filtered.length,
      isLoading: query.isLoading,
      error: null,
      isFromCache: true,
      cachedAt: cache.cachedAt,
      refresh: () => {
        query.refetch()
      },
    }
  }

  return {
    prompts: [],
    tags: [],
    total: 0,
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    isFromCache: false,
    cachedAt: null,
    refresh: () => {
      query.refetch()
    },
  }
}

interface ClientFilters {
  search: string
  tag: string | null
  category: string | null
  favorite: boolean | null
}

function applyClientFilters(prompts: Prompt[], filters: ClientFilters): Prompt[] {
  const q = filters.search.trim().toLowerCase()
  return prompts.filter((p) => {
    if (filters.favorite === true && !p.isFavorite) return false
    if (filters.tag && !p.tags.some((t) => t.name === filters.tag)) return false
    if (filters.category && p.category !== filters.category) return false
    if (q && !`${p.title} ${p.content}`.toLowerCase().includes(q)) return false
    return true
  })
}
