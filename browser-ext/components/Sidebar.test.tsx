import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("../hooks/useBackendHealth", () => ({ useBackendHealth: vi.fn() }))
vi.mock("../contexts/AppConfig", () => ({ useAppConfig: vi.fn() }))
vi.mock("../hooks/useActiveDatabase", () => ({ useActiveDatabase: vi.fn() }))
vi.mock("./PromptsTab", () => ({ PromptsTab: () => null }))
vi.mock("./ComposeTab", () => ({ ComposeTab: () => null }))
vi.mock("./SettingsTab", () => ({ SettingsTab: () => null }))
vi.mock("./StatusBar", () => ({ StatusBar: () => null }))

import { useAppConfig } from "../contexts/AppConfig"
import { useActiveDatabase } from "../hooks/useActiveDatabase"
import { Sidebar } from "./Sidebar"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAppConfig).mockReturnValue({
    activeTab: "compose",
    setActiveTab: vi.fn(),
  } as unknown as ReturnType<typeof useAppConfig>)
})

describe("Sidebar — undecryptable fallback banner", () => {
  it("shows the banner when the active database is undecryptable", () => {
    vi.mocked(useActiveDatabase).mockReturnValue({
      activeConnection: { label: "Prod" } as never,
      isUndecryptable: true,
      isLoading: false,
    })
    render(<Sidebar />)
    expect(screen.getByText(/couldn't be decrypted/i)).toBeTruthy()
    expect(screen.getByText(/Prod/)).toBeTruthy()
  })

  it("hides the banner when the active database is healthy", () => {
    vi.mocked(useActiveDatabase).mockReturnValue({
      activeConnection: null,
      isUndecryptable: false,
      isLoading: false,
    })
    render(<Sidebar />)
    expect(screen.queryByText(/couldn't be decrypted/i)).toBeNull()
  })
})
