import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { useAppConfig, type AppConfig } from "../../contexts/AppConfig"
import type { Prompt } from "../../types"

vi.mock("../../contexts/AppConfig", () => ({ useAppConfig: vi.fn() }))
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => React.createElement("div", props, children),
  },
}))

vi.mock("../../lib/api", () => ({
  listDatabases: vi.fn(),
  createDatabase: vi.fn(),
  updateDatabase: vi.fn(),
  deleteDatabase: vi.fn(),
  activateDatabase: vi.fn(),
  migrateDatabase: vi.fn(),
}))

import * as api from "../../lib/api"
import { DatabaseManager } from "./DatabaseManager"

const listDatabases = vi.mocked(api.listDatabases)
const deleteDatabase = vi.mocked(api.deleteDatabase)
const activateDatabase = vi.mocked(api.activateDatabase)
const migrateDatabase = vi.mocked(api.migrateDatabase)

function makeConfig(): AppConfig {
  return {
    backend: { isInstalled: true, url: "http://localhost:8000" },
    ai: {
      localConnected: false,
      activeProvider: null,
      selectedModel: null,
      availableModels: [],
      providers: [],
      assignments: { chat: null, transform: null },
    },
    viewMode: "admin",
    quickActions: [],
  }
}

const DEFAULT_CONN = {
  id: "default-id",
  label: "Default SQLite",
  engine: "sqlite" as const,
  hasPassword: false,
  host: null,
  port: null,
  database: null,
  maskedUrl: "sqlite:////home/me/l1br3.db",
  isActive: true,
  isDefault: true,
}

const PG_CONN = {
  id: "pg-id",
  label: "Work Postgres",
  engine: "postgresql" as const,
  hasPassword: true,
  host: "host",
  port: 5432,
  database: "db",
  maskedUrl: "postgresql://user:***@host:5432/db",
  isActive: false,
  isDefault: false,
}

function renderManager() {
  vi.mocked(useAppConfig).mockReturnValue({
    config: makeConfig(),
    updateAi: vi.fn(),
    updateConfig: vi.fn(),
    setConfig: vi.fn(),
    activeTab: "compose",
    setActiveTab: vi.fn(),
    editingPrompt: null as Prompt | null,
    setEditingPrompt: vi.fn(),
  } as unknown as ReturnType<typeof useAppConfig>)
  return render(<DatabaseManager />)
}

beforeEach(() => {
  vi.clearAllMocks()
  listDatabases.mockResolvedValue([DEFAULT_CONN, PG_CONN])
})

describe("DatabaseManager", () => {
  it("renders the header and loads connections on mount", async () => {
    renderManager()
    expect(screen.getByText("Database connections")).toBeInTheDocument()
    await waitFor(() => {
      expect(listDatabases).toHaveBeenCalledWith("http://localhost:8000")
    })
    await waitFor(() => {
      expect(screen.getByText("Default SQLite")).toBeInTheDocument()
      expect(screen.getByText("Work Postgres")).toBeInTheDocument()
    })
  })

  it("shows the Active badge on the active connection", async () => {
    renderManager()
    await waitFor(() => expect(screen.getByText("Work Postgres")).toBeInTheDocument())
    const activeBadges = screen.getAllByText("Active")
    expect(activeBadges.length).toBeGreaterThanOrEqual(1)
  })

  it("opens the add-connection modal when Add connection is clicked", async () => {
    renderManager()
    await waitFor(() => expect(screen.getByText("Work Postgres")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /add connection/i }))
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByText("Add Database Connection")).toBeInTheDocument()
  })

  it("activates a non-active connection via the backend", async () => {
    activateDatabase.mockResolvedValue({ ...PG_CONN, isActive: true })
    renderManager()
    await waitFor(() => expect(screen.getByText("Work Postgres")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /^activate$/i }))
    await waitFor(() => {
      expect(activateDatabase).toHaveBeenCalledWith("http://localhost:8000", "pg-id")
    })
    await waitFor(() => {
      expect(listDatabases.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it("deletes a non-default connection via the backend", async () => {
    deleteDatabase.mockResolvedValue(undefined)
    renderManager()
    await waitFor(() => expect(screen.getByText("Work Postgres")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /delete connection/i }))
    await waitFor(() => {
      expect(deleteDatabase).toHaveBeenCalledWith("http://localhost:8000", "pg-id")
    })
  })

  it("opens the migration modal for a non-active connection", async () => {
    renderManager()
    await waitFor(() => expect(screen.getByText("Work Postgres")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /migrate & activate/i }))
    // The modal confirm step exposes a "Migrate" action button (card has none).
    expect(screen.getByRole("button", { name: /^migrate$/i })).toBeInTheDocument()
  })

  it("runs migrateDatabase on confirm and refreshes on success", async () => {
    migrateDatabase.mockImplementation(async (_url, _id, opts) => {
      opts.onMigrationMeta?.({ sourceEngine: "sqlite", targetEngine: "postgresql", tables: ["tags", "prompts"] })
      opts.onProgress?.({ table: "tags", phase: "done", copied: 2, total: 2 })
    })
    renderManager()
    await waitFor(() => expect(screen.getByText("Work Postgres")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /migrate & activate/i }))
    fireEvent.click(screen.getByRole("button", { name: /^migrate$/i }))
    await waitFor(() => {
      expect(migrateDatabase).toHaveBeenCalledWith(
        "http://localhost:8000",
        "pg-id",
        expect.any(Object),
        expect.any(AbortSignal),
      )
    })
    // On success the connection list is refreshed.
    await waitFor(() => {
      expect(listDatabases.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
