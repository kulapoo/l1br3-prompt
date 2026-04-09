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

  // Set side panel behavior on install
  browser.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
    }
  })
})
