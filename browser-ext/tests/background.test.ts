import { vi, describe, it, expect, beforeEach } from 'vitest'

const browserMock = {
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://abc${path}`),
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
  },
  tabs: {
    create: vi.fn(),
    onActivated: { addListener: vi.fn() },
  },
  action: { onClicked: { addListener: vi.fn() } },
  alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  storage: { local: { set: vi.fn(), get: vi.fn().mockResolvedValue({}) } },
}

// WXT injects defineBackground globally at build time; stub it for unit tests.
;(globalThis as unknown as { defineBackground: (fn: () => void) => unknown }).defineBackground =
  (_fn: () => void) => undefined

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as unknown as { browser: typeof browserMock }).browser = browserMock
  browserMock.tabs.create.mockResolvedValue({ id: 99 })
})

describe('openAdminTab', () => {
  it('opens a new browser tab pointing at admin.html', async () => {
    const { openAdminTab } = await import('../entrypoints/background')
    await openAdminTab()
    expect(browserMock.runtime.getURL).toHaveBeenCalledWith('/admin.html')
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://abc/admin.html',
    })
  })

  it('deep-links to a target view via the view query param', async () => {
    const { openAdminTab } = await import('../entrypoints/background')
    await openAdminTab('models')
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://abc/admin.html?view=models',
    })
  })

  it('swallows errors from tabs.create', async () => {
    browserMock.tabs.create.mockRejectedValue(new Error('denied'))
    const { openAdminTab } = await import('../entrypoints/background')
    await expect(openAdminTab()).resolves.toBeUndefined()
  })
})
