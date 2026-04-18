import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAppConfig } from '../contexts/AppConfig'
import { deletePrompt, updatePrompt, recordCopy, createPrompt } from '../lib/api'
import type { FetchPromptsResult } from '../lib/api'
import type { Prompt, PromptCreate } from '../types'

const PROMPTS_KEY = { queryKey: ['prompts'] }

export function usePromptMutations() {
  const { config } = useAppConfig()
  const queryClient = useQueryClient()
  const baseUrl = config.backend.url

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePrompt(baseUrl, id),
    onMutate: async (id) => {
      await queryClient.cancelQueries(PROMPTS_KEY)
      const snapshot = queryClient.getQueriesData<FetchPromptsResult>(PROMPTS_KEY)
      queryClient.setQueriesData<FetchPromptsResult>(PROMPTS_KEY, (old) =>
        old ? { ...old, prompts: old.prompts.filter((p) => p.id !== id) } : old
      )
      return { snapshot }
    },
    onError: (_err, _id, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSettled: () => queryClient.invalidateQueries(PROMPTS_KEY),
  })

  const toggleFavoriteMutation = useMutation({
    mutationFn: (prompt: Prompt) =>
      updatePrompt(baseUrl, prompt.id, { isFavorite: !prompt.isFavorite }),
    onMutate: async (prompt) => {
      await queryClient.cancelQueries(PROMPTS_KEY)
      const snapshot = queryClient.getQueriesData<FetchPromptsResult>(PROMPTS_KEY)
      queryClient.setQueriesData<FetchPromptsResult>(PROMPTS_KEY, (old) =>
        old
          ? {
              ...old,
              prompts: old.prompts.map((p) =>
                p.id === prompt.id ? { ...p, isFavorite: !p.isFavorite } : p
              ),
            }
          : old
      )
      return { snapshot }
    },
    onError: (_err, _prompt, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSettled: () => queryClient.invalidateQueries(PROMPTS_KEY),
  })

  const recordCopyMutation = useMutation({
    mutationFn: (id: string) => recordCopy(baseUrl, id),
    onMutate: async (id) => {
      await queryClient.cancelQueries(PROMPTS_KEY)
      const snapshot = queryClient.getQueriesData<FetchPromptsResult>(PROMPTS_KEY)
      queryClient.setQueriesData<FetchPromptsResult>(PROMPTS_KEY, (old) =>
        old
          ? {
              ...old,
              prompts: old.prompts.map((p) =>
                p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p
              ),
            }
          : old
      )
      return { snapshot }
    },
    onSuccess: (serverPrompt, id) => {
      // Replace optimistic value with server's authoritative prompt (correct lastUsed)
      queryClient.setQueriesData<FetchPromptsResult>(PROMPTS_KEY, (old) =>
        old
          ? { ...old, prompts: old.prompts.map((p) => (p.id === id ? serverPrompt : p)) }
          : old
      )
    },
    onError: (_err, _id, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
  })

  return { deleteMutation, toggleFavoriteMutation, recordCopyMutation }
}

export function useCreatePrompt() {
  const { config } = useAppConfig()
  const queryClient = useQueryClient()
  const baseUrl = config.backend.url

  return useMutation({
    mutationFn: (data: PromptCreate) => createPrompt(baseUrl, data),
    onSettled: () => queryClient.invalidateQueries(PROMPTS_KEY),
  })
}
