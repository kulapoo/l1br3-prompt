import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppConfig } from '../contexts/AppConfig'
import { createTransformMode, deleteTransformMode, fetchTransformModes } from '../lib/api'

const KEY = ['transform-modes']

/**
 * Fetches built-in + user-saved transform modes and exposes create/delete
 * mutations that invalidate the shared cache.
 */
export function useTransformModes() {
  const { config } = useAppConfig()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: KEY,
    queryFn: () => fetchTransformModes(config.backend.url),
    enabled: config.backend.isInstalled,
  })

  const createMode = useMutation({
    mutationFn: (data: { name: string; instruction: string }) =>
      createTransformMode(config.backend.url, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  const removeMode = useMutation({
    mutationFn: (id: string) => deleteTransformMode(config.backend.url, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return {
    modes: query.data ?? [],
    isLoading: query.isLoading,
    createMode,
    removeMode,
  }
}
