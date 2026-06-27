import { describe, expect, it, vi, beforeEach } from "vitest"

import { exportMasterKey, getMasterKeyStatus, importMasterKey } from "../api"

const BASE = "http://localhost:8000"

function mockOnce(payload: unknown, ok = true): void {
  const body = ok
    ? { success: true, data: payload, error: null }
    : { success: false, data: null, error: String(payload) }
  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  } as Response)
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(globalThis, "fetch")
})

describe("getMasterKeyStatus", () => {
  it("GETs /api/v1/security/master-key/status and unwraps data", async () => {
    mockOnce({ present: true, envOverride: false })
    const result = await getMasterKeyStatus(BASE)
    expect(result).toEqual({ present: true, envOverride: false })
    expect(globalThis.fetch).toHaveBeenCalledWith(`${BASE}/api/v1/security/master-key/status`, expect.anything())
  })

  it("throws on backend error", async () => {
    mockOnce("boom", false)
    await expect(getMasterKeyStatus(BASE)).rejects.toThrow("boom")
  })
})

describe("exportMasterKey", () => {
  it("POSTs passphrase and returns the bundle", async () => {
    const bundle = { version: 1, kdf: "scrypt", salt: "abc", params: { N: 16384, r: 8, p: 1 }, ciphertext: "tok" }
    mockOnce({ bundle, warning: null })
    const result = await exportMasterKey(BASE, "pw")
    expect(result.bundle).toEqual(bundle)
    expect(result.warning).toBeNull()
    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(call?.[0]).toBe(`${BASE}/api/v1/security/master-key/export`)
    expect(call?.[1]?.method).toBe("POST")
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({ passphrase: "pw" })
  })
})

describe("importMasterKey", () => {
  it("POSTs bundle + passphrase and returns result", async () => {
    const bundle = { version: 1, kdf: "scrypt", salt: "abc", params: { N: 16384, r: 8, p: 1 }, ciphertext: "tok" }
    mockOnce({ imported: true, previousKeyPresent: false })
    const result = await importMasterKey(BASE, "pw", bundle)
    expect(result.imported).toBe(true)
    expect(result.previousKeyPresent).toBe(false)
    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(call?.[0]).toBe(`${BASE}/api/v1/security/master-key/import`)
    expect(JSON.parse(call?.[1]?.body as string)).toEqual({ passphrase: "pw", bundle })
  })
})
