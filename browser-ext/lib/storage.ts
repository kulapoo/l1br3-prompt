import { AppConfig } from '../contexts/AppConfig'

const STORAGE_KEY = 'l1br3_config'

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
