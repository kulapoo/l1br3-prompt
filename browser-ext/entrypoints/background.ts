import { createSupabaseClient } from '../lib/supabase'
import { SyncService } from '../lib/sync'
import { defaultConfig } from '../contexts/AppConfig'
import { loadConfig } from '../lib/storage'
import { pingBackend } from '../lib/api'

declare const chrome: typeof browser & {
  sidePanel?: {
    open: (options: { tabId: number }) => Promise<void>
    setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void>
  }
}

const SYNC_ALARM = 'l1br3-sync'
const SYNC_INTERVAL_MINUTES = 5

export default defineBackground(() => {
  // Open side panel when action is clicked
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId: tab.id })
    }
  })

  // Set side panel behavior on install; create periodic sync alarm; do an
  // initial backend health check so the stored isInstalled flag is correct
  // before the user even opens the sidebar.
  browser.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
    }
    browser.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES })
    void _refreshBackendHealth()
  })

  // Recreate alarm on browser startup (alarms don't persist across restarts in all browsers)
  // and re-check backend health while we're at it.
  browser.runtime.onStartup.addListener(() => {
    browser.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES })
    void _refreshBackendHealth()
  })

  // Notify sidebar when the active tab changes so it can refresh suggestions,
  // and trigger a background sync if sync is enabled
  browser.tabs.onActivated.addListener(() => {
    browser.runtime.sendMessage({ type: 'TAB_CHANGED' }).catch(() => {})
    _maybeSyncBackground()
  })

  // Periodic sync via alarm
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) {
      _maybeSyncBackground()
    }
  })
})

/**
 * One-shot probe of the local backend, mirroring the in-sidebar
 * useBackendHealth hook so the stored flag is correct even before the
 * sidebar is opened.
 */
async function _refreshBackendHealth(): Promise<void> {
  try {
    const config = await loadConfig(defaultConfig)
    const reachable = await pingBackend(config.backend.url)
    if (reachable === config.backend.isInstalled) return
    await browser.storage.local.set({
      l1br3_config: {
        ...config,
        backend: { ...config.backend, isInstalled: reachable },
      },
    })
  } catch {
    // Storage errors during startup are silent — the in-sidebar hook will
    // self-correct as soon as the user opens the panel.
  }
}

async function _maybeSyncBackground(): Promise<void> {
  try {
    const config = await loadConfig(defaultConfig)
    const { sync, backend } = config

    if (!sync.enabled || !sync.userId || !sync.accessToken || !sync.supabaseUrl || !sync.supabaseAnonKey) {
      return
    }
    if (!backend.isInstalled) return

    const supabase = createSupabaseClient(sync.supabaseUrl, sync.supabaseAnonKey)
    const service = new SyncService(backend.url, supabase, sync.accessToken, sync.userId)
    const result = await service.performSync()

    // Persist updated sync time back to storage
    const updated = {
      ...sync,
      lastSyncTime: new Date().toISOString(),
      syncStatus: result.errors.length > 0 ? 'error' : 'success',
      syncError: result.errors.length > 0 ? result.errors[0] : null,
    }
    await browser.storage.local.set({ l1br3_config: { ...config, sync: updated } })

    // Tell sidepanel to re-hydrate its state
    browser.runtime.sendMessage({ type: 'SYNC_COMPLETE', result }).catch(() => {})
  } catch {
    // Background sync failures are silent — user sees status in Settings
  }
}
