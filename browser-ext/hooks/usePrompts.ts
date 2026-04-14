import { useQuery } from '@tanstack/react-query'
import { useAppConfig } from '../contexts/AppConfig'
import { fetchPrompts } from '../lib/api'
import { useDebounce } from './useDebounce'
import type { Prompt, Tag } from '../types'

interface UsePromptsReturn {
  prompts: Prompt[]
  tags: Tag[]
  total: number
  isLoading: boolean
  error: string | null
  refresh: () => void
}

export function usePrompts(
  search: string,
  tagFilter: string | null,
  favoriteFilter: boolean | null,
): UsePromptsReturn {
  const { config } = useAppConfig()
  const debouncedSearch = useDebounce(search, 300)

  const query = useQuery({
    queryKey: ['prompts', { search: debouncedSearch, tag: tagFilter, favorite: favoriteFilter }],
    queryFn: () =>
      fetchPrompts(config.backend.url, {
        search: debouncedSearch || undefined,
        tag: tagFilter ?? undefined,
        favorite: favoriteFilter ?? undefined,
      }),
    enabled: config.backend.isInstalled,
  })

  return {
    prompts: query.data?.prompts ?? [],
    tags: query.data?.tags ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    refresh: () => { query.refetch() },
  }
}
