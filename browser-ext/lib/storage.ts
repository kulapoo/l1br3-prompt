import { AppConfig } from '../contexts/AppConfig'
import type { Prompt, PromptStats, Tag } from '../types'

const STORAGE_KEY = 'l1br3_config'
const PROMPT_CACHE_KEY = 'l1br3_prompt_cache'
const CATEGORY_CACHE_KEY = 'l1br3_category_cache'
const STATS_CACHE_KEY = 'l1br3_stats_cache'

export interface PromptCacheEntry {
  prompts: Prompt[]
  tags: Tag[]
  cachedAt: string
  backendUrl?: string
}

/** Persist the subset of AppConfig that should survive extension reloads. */
export async function saveConfig(config: AppConfig): Promise<void> {
  const persistable = {
    backend: config.backend,
    ai: {
      localConnected: config.ai.localConnected,
      cloudEnabled: config.ai.cloudEnabled,
      cloudQuotaRemaining: config.ai.cloudQuotaRemaining,
      cloudQuotaTotal: config.ai.cloudQuotaTotal,
      cloudQuotaResetAt: config.ai.cloudQuotaResetAt,
      selectedModel: config.ai.selectedModel,
      availableModels: config.ai.availableModels,
      deviceId: config.ai.deviceId,
      providers: config.ai.providers,
      assignments: config.ai.assignments,
      // activeProvider is session-only — reset to null on reload
    },
    sync: config.sync,
    quickActions: config.quickActions,
    viewMode: config.viewMode,
  }
  await browser.storage.local.set({ [STORAGE_KEY]: persistable })
}

/** Drop the cached prompts (e.g. after a logout or reset). */
export async function clearPromptCache(): Promise<void> {
  try {
    await browser.storage.local.remove(PROMPT_CACHE_KEY)
  } catch {
    // swallow
  }
}

/**
 * Read the cache only if it belongs to the given backend URL.
 * Returns null on mismatch or missing backendUrl (legacy entry treated as miss).
 */
export async function getCachedPromptsFor(backendUrl: string): Promise<PromptCacheEntry | null> {
  try {
    const result = await browser.storage.local.get(PROMPT_CACHE_KEY)
    const cached = result[PROMPT_CACHE_KEY] as PromptCacheEntry | undefined
    if (!cached || !cached.backendUrl || cached.backendUrl !== backendUrl) return null
    return cached
  } catch {
    return null
  }
}

/** Write a URL-scoped cache entry. Best-effort: failures are swallowed. */
export async function cachePromptsFor(
  backendUrl: string,
  prompts: Prompt[],
  tags: Tag[],
): Promise<void> {
  try {
    const entry: PromptCacheEntry = { prompts, tags, cachedAt: new Date().toISOString(), backendUrl }
    await browser.storage.local.set({ [PROMPT_CACHE_KEY]: entry })
  } catch {
    // swallow
  }
}

/** Cache the list of distinct categories for offline dropdown population. */
export async function cacheCategories(categories: string[]): Promise<void> {
  try {
    await browser.storage.local.set({ [CATEGORY_CACHE_KEY]: categories })
  } catch {
    // swallow
  }
}

export async function cacheStats(stats: PromptStats): Promise<void> {
  try {
    await browser.storage.local.set({ [STATS_CACHE_KEY]: stats })
  } catch {
    // swallow
  }
}

export async function getCachedStats(): Promise<PromptStats | null> {
  try {
    const result = await browser.storage.local.get(STATS_CACHE_KEY)
    return (result[STATS_CACHE_KEY] as PromptStats | undefined) ?? null
  } catch {
    return null
  }
}

export async function getCachedCategories(): Promise<string[]> {
  try {
    const result = await browser.storage.local.get(CATEGORY_CACHE_KEY)
    const cached = result[CATEGORY_CACHE_KEY] as string[] | undefined
    return cached ?? []
  } catch {
    return []
  }
}

/** Load persisted config, merged over the provided defaults. */
export async function loadConfig(defaults: AppConfig): Promise<AppConfig> {
  const result = await browser.storage.local.get(STORAGE_KEY)
  const saved = result[STORAGE_KEY] as Partial<AppConfig> | undefined
  if (!saved) return defaults
  return {
    ...defaults,
    ...saved,
    backend: { ...defaults.backend, ...saved.backend },
    ai: { ...defaults.ai, ...saved.ai },
    sync: { ...defaults.sync, ...saved.sync },
    quickActions: saved.quickActions ?? defaults.quickActions,
  }
}
