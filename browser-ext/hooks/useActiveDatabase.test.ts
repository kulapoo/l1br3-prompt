import React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { vi, describe, it, expect, beforeEach } from "vitest"
import type { AppConfig } from "../contexts/AppConfig"
import type { DatabaseConnectionRead } from "../types"

vi.mock("../contexts/AppConfig", () => ({ useAppConfig: vi.fn() }))
vi.mock("../lib/api", () => ({ listDatabases: vi.fn() }))

import { useAppConfig } from "../contexts/AppConfig"
import { listDatabases } from "../lib/api"
import { useActiveDatabase } from "./useActiveDatabase"

const mockConfig: AppConfig = {
  backend: { isInstalled: true, url: "http://localhost:8000" },
  ai: {
    localConnected: false,
    activeProvider: null,
    selectedModel: null,
    availableModels: [],
    providers: [],
    assignments: { chat: null, transform: null },
  },
  viewMode: "sidebar",
  quickActions: [],
}

const baseCtx = {
  config: mockConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateAi: vi.fn(),
  activeTab: "compose" as const,
  setActiveTab: vi.fn(),
  editingPrompt: null,
  setEditingPrompt: vi.fn(),
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

const undecryptable: DatabaseConnectionRead = {
  id: "x",
  label: "Prod",
  engine: "postgresql",
  hasPassword: true,
  host: "h",
  port: 5432,
  database: "db",
  maskedUrl: "postgresql://u:***@h:5432/db",
  isActive: true,
  isDefault: false,
  undecryptable: true,
}
const healthy: DatabaseConnectionRead = { ...undecryptable, undecryptable: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAppConfig).mockReturnValue(baseCtx as unknown as ReturnType<typeof useAppConfig>)
})

describe("useActiveDatabase", () => {
  it("isUndecryptable is true when the active connection is flagged", async () => {
    vi.mocked(listDatabases).mockResolvedValue([undecryptable])
    const { result } = renderHook(() => useActiveDatabase(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isUndecryptable).toBe(true))
    expect(result.current.activeConnection?.label).toBe("Prod")
  })

  it("isUndecryptable is false when the active connection is healthy", async () => {
    vi.mocked(listDatabases).mockResolvedValue([healthy])
    const { result } = renderHook(() => useActiveDatabase(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isUndecryptable).toBe(false))
  })
})
