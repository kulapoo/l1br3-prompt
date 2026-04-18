export async function insertIntoActiveTab(text: string): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  try {
    await browser.tabs.sendMessage(tab.id, { type: 'INSERT_TEXT', text })
  } catch {
    // Content script absent on this page — acceptable no-op
  }
}
