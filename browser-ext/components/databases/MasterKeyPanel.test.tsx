import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"

import { MasterKeyPanel } from "./MasterKeyPanel"

vi.mock("../../contexts/AppConfig", () => ({
  useAppConfig: () => ({ config: { backend: { url: "http://localhost:8000" } } }),
}))

vi.mock("../../lib/api", () => ({
  getMasterKeyStatus: vi.fn(),
  exportMasterKey: vi.fn(),
  importMasterKey: vi.fn(),
}))

import { getMasterKeyStatus, exportMasterKey, importMasterKey } from "../../lib/api"

// Minimal X wrapper so tests don't need the full app shell.
function withX(node: ReactNode) {
  return node
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("MasterKeyPanel — status", () => {
  it("renders 'Missing' when no key + no env", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: false, envOverride: false })
    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/missing/i)).toBeInTheDocument())
  })

  it("renders 'Present · file' when file exists", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: true, envOverride: false })
    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/present/i)).toBeInTheDocument())
    expect(screen.queryByText(/env override/i)).not.toBeInTheDocument()
  })

  it("renders 'Present · env override' when env var is set", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: true, envOverride: true })
    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/env override/i)).toBeInTheDocument())
  })
})

describe("MasterKeyPanel — export flow", () => {
  it("rejects when passphrase + confirm do not match", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: true, envOverride: false })
    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/present/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /export/i }))
    // Disambiguate "Passphrase" from "Confirm passphrase" — both end in "passphrase",
    // so /^passphrase$/i matches only the first.
    fireEvent.change(screen.getByLabelText(/^passphrase$/i), { target: { value: "aaa" } })
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: "bbb" } })
    fireEvent.click(screen.getByRole("button", { name: /download/i }))

    await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument())
    expect(exportMasterKey).not.toHaveBeenCalled()
  })

  it("calls exportMasterKey and triggers download on match", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: true, envOverride: false })
    const bundle = { version: 1, kdf: "scrypt", salt: "s", params: { N: 16384, r: 8, p: 1 }, ciphertext: "c" }
    vi.mocked(exportMasterKey).mockResolvedValue({ bundle, warning: null })

    // Spy on the real anchor's click instead of faking createElement — faking it
    // either recurses (mockImplementation calls the spy) or returns an object
    // jsdom rejects from appendChild. jsdom builds a real <a>; we observe the click.
    const clickSpy = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clickSpy)
    URL.createObjectURL = vi.fn(() => "blob:fake")
    URL.revokeObjectURL = vi.fn()

    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/present/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /export/i }))
    fireEvent.change(screen.getByLabelText(/^passphrase$/i), { target: { value: "right" } })
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: "right" } })
    fireEvent.click(screen.getByRole("button", { name: /download/i }))

    await waitFor(() => expect(exportMasterKey).toHaveBeenCalledWith("http://localhost:8000", "right"))
    await waitFor(() => expect(clickSpy).toHaveBeenCalled())
  })
})

describe("MasterKeyPanel — import flow", () => {
  it("warns before overwrite when status.present is true", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: true, envOverride: false })
    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/present/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /import/i }))
    await waitFor(() => expect(screen.getByText(/replaces your existing/i)).toBeInTheDocument())
  })

  it("does not warn when no existing key", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: false, envOverride: false })
    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/missing/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /import/i }))
    await waitFor(() => expect(screen.queryByText(/replaces your existing/i)).not.toBeInTheDocument())
  })

  it("calls importMasterKey on submit", async () => {
    vi.mocked(getMasterKeyStatus).mockResolvedValue({ present: false, envOverride: false })
    vi.mocked(importMasterKey).mockResolvedValue({ imported: true, previousKeyPresent: false })

    const bundle = { version: 1, kdf: "scrypt", salt: "s", params: { N: 16384, r: 8, p: 1 }, ciphertext: "c" }
    render(withX(<MasterKeyPanel />))
    await waitFor(() => expect(screen.getByText(/missing/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: /import/i }))
    // Inject a bundle via a hidden text area (the panel exposes one for testability).
    fireEvent.change(screen.getByTestId("import-bundle-textarea"), { target: { value: JSON.stringify(bundle) } })
    fireEvent.change(screen.getByLabelText(/passphrase/i), { target: { value: "pw" } })
    fireEvent.click(screen.getByRole("button", { name: /import key/i }))

    await waitFor(() => expect(importMasterKey).toHaveBeenCalledWith("http://localhost:8000", "pw", bundle))
  })
})
