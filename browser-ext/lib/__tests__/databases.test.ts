/**
 * Tests for the Database Manager API client (Milestone 3).
 *
 * Mirrors lib/__tests__/api.test.ts: fetch is mocked via vitest; each function
 * is asserted to hit the right endpoint, unwrap the ApiResponse envelope, and
 * throw on failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { listDatabases, createDatabase, updateDatabase, deleteDatabase, testDatabase, activateDatabase } from "../api"

function makeJsonFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => "error body",
  })
}

const BASE = "http://localhost:8000"

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("listDatabases", () => {
  it("unwraps the data array on success", async () => {
    vi.stubGlobal("fetch", makeJsonFetch({ success: true, data: [{ id: "x", engine: "sqlite" }] }))
    const result = await listDatabases(BASE)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("x")
  })

  it("hits GET /api/v1/databases", async () => {
    const mockFetch = makeJsonFetch({ success: true, data: [] })
    vi.stubGlobal("fetch", mockFetch)
    await listDatabases(BASE)
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE}/api/v1/databases`)
  })

  it("throws when success is false", async () => {
    vi.stubGlobal("fetch", makeJsonFetch({ success: false, error: "boom", data: null }))
    await expect(listDatabases(BASE)).rejects.toThrow("boom")
  })
})

describe("createDatabase", () => {
  it("posts label/engine/url and returns data", async () => {
    const mockFetch = makeJsonFetch({ success: true, data: { id: "new", engine: "sqlite" } })
    vi.stubGlobal("fetch", mockFetch)
    const result = await createDatabase(BASE, {
      label: "Local",
      engine: "sqlite",
      url: "sqlite:///x.db",
    })
    expect(result.id).toBe("new")
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/databases`)
    expect(opts.method).toBe("POST")
    const body = JSON.parse(opts.body as string)
    expect(body).toEqual({ label: "Local", engine: "sqlite", url: "sqlite:///x.db" })
  })
})

describe("updateDatabase", () => {
  it("patches only provided fields", async () => {
    const mockFetch = makeJsonFetch({ success: true, data: { id: "x" } })
    vi.stubGlobal("fetch", mockFetch)
    await updateDatabase(BASE, "x", { label: "Renamed" })
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/databases/x`)
    expect(opts.method).toBe("PATCH")
    expect(JSON.parse(opts.body as string)).toEqual({ label: "Renamed" })
  })
})

describe("deleteDatabase", () => {
  it("issues DELETE and resolves on success", async () => {
    const mockFetch = makeJsonFetch({ success: true, data: null })
    vi.stubGlobal("fetch", mockFetch)
    await deleteDatabase(BASE, "x")
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/databases/x`)
    expect(opts.method).toBe("DELETE")
  })
})

describe("testDatabase", () => {
  it("posts to /test and returns ok/error", async () => {
    const mockFetch = makeJsonFetch({ success: true, data: { ok: true, error: null } })
    vi.stubGlobal("fetch", mockFetch)
    const result = await testDatabase(BASE, { engine: "sqlite", url: "sqlite:///x.db" })
    expect(result.ok).toBe(true)
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/databases/test`)
    expect(opts.method).toBe("POST")
  })
})

describe("activateDatabase", () => {
  it("posts to /{id}/activate and returns the active connection", async () => {
    const mockFetch = makeJsonFetch({
      success: true,
      data: { id: "x", isActive: true },
    })
    vi.stubGlobal("fetch", mockFetch)
    const result = await activateDatabase(BASE, "x")
    expect(result.isActive).toBe(true)
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/v1/databases/x/activate`)
    expect(opts.method).toBe("POST")
  })
})
