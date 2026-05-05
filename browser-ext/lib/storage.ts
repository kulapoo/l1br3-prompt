import { AppConfig } from '../contexts/AppConfig'
import type { Prompt, Tag } from '../types'

const STORAGE_KEY = 'l1br3_config'
const PROMPT_CACHE_KEY = 'l1br3_prompt_cache'
const CATEGORY_CACHE_KEY = 'l1br3_category_cache'

export interface PromptCacheEntry {
  prompts: Prompt[]
  tags: Tag[]
  cachedAt: string
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
      // activeProvider is session-only — reset to null on reload
    },
    sync: config.sync,
    quickActions: config.quickActions,
    // viewMode intentionally excluded — always reopen in sidebar mode
  }
  await browser.storage.local.set({ [STORAGE_KEY]: persistable })
}

/**
 * Persist the last-fetched prompts so the extension can show something
 * useful when the backend is offline. Best-effort: failures are swallowed
 * since the extension is still usable without the cache.
 */
export async function cachePrompts(prompts: Prompt[], tags: Tag[]): Promise<void> {
  try {
    const entry: PromptCacheEntry = { prompts, tags, cachedAt: new Date().toISOString() }
    await browser.storage.local.set({ [PROMPT_CACHE_KEY]: entry })
  } catch {
    // Cache is best-effort — swallow errors.
  }
}

/** Read the last-cached prompts (or null if none). Never throws. */
export async function getCachedPrompts(): Promise<PromptCacheEntry | null> {
  try {
    const result = await browser.storage.local.get(PROMPT_CACHE_KEY)
    const cached = result[PROMPT_CACHE_KEY] as PromptCacheEntry | undefined
    return cached ?? null
  } catch {
    return null
  }
}

/** Drop the cached prompts (e.g. after a logout or reset). */
export async function clearPromptCache(): Promise<void> {
  try {
    await browser.storage.local.remove(PROMPT_CACHE_KEY)
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
