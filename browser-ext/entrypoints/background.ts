import { defaultConfig } from '../contexts/AppConfig'
import { loadConfig } from '../lib/storage'
import { pingBackend } from '../lib/api'

declare const chrome: typeof browser & {
  sidePanel?: {
    open: (options: { tabId: number }) => Promise<void>
    setPanelBehavior: (options: { openPanelOnActionClick: boolean }) => Promise<void>
  }
}

export default defineBackground(() => {
  // Open side panel when action is clicked
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id && chrome.sidePanel) {
      await chrome.sidePanel.open({ tabId: tab.id })
    }
  })

  // Set side panel behavior on install and do an initial backend health check so
  // the stored isInstalled flag is correct before the user even opens the sidebar.
  browser.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
    }
    void _refreshBackendHealth()
  })

  // Re-check backend health on browser startup.
  browser.runtime.onStartup.addListener(() => {
    void _refreshBackendHealth()
  })

  // Sidepanel asks us to open the admin workbench in a new tab.
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === 'OPEN_ADMIN') {
      const target = (message as { target?: string }).target
      void openAdminTab(target)
    }
  })
})

/**
 * Open the admin workbench page in a new browser tab. Exported for testing.
 * An optional `target` (e.g. 'models') deep-links to a specific admin view.
 */
export async function openAdminTab(target?: string): Promise<void> {
  try {
    const url = new URL(browser.runtime.getURL('/admin.html'))
    if (target) url.searchParams.set('view', target)
    await browser.tabs.create({ url: url.href })
  } catch {
    // Tab API failures are silent — user can retry from Settings.
  }
}

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
