import { describe, it, expect, vi } from "vitest"
import type { AiProviderConfig, ModelAssignment, ModelRole } from "../types"
import { resolveRoleProvider } from "./roleRouter"

function makeProvider(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    id: "p-openai",
    type: "openai",
    label: "OpenAI",
    baseUrl: null,
    serverProviderId: "srv-openai",
    hasKey: true,
    enabled: true,
    capabilities: ["language"],
    models: ["gpt-4o"],
    configured: true,
    ...overrides,
  }
}

const NO_ASSIGNMENTS = { chat: null, transform: null } satisfies Record<ModelRole, ModelAssignment | null>

describe("resolveRoleProvider", () => {
  it("falls back to Ollama (no byok) when no assignment exists for the role", () => {
    const result = resolveRoleProvider("chat", [makeProvider()], NO_ASSIGNMENTS, {
      fallbackModel: "llama3:8b",
    })
    expect(result.byok).toBeUndefined()
    expect(result.model).toBe("llama3:8b")
  })

  it("resolves an Ollama assignment without emitting a byok config", () => {
    const assignments = {
      chat: { providerId: "ollama", model: "llama3:8b" },
      transform: null,
    }
    const result = resolveRoleProvider("chat", [makeProvider()], assignments, {
      fallbackModel: "fallback",
    })
    expect(result.byok).toBeUndefined()
    expect(result.model).toBe("llama3:8b")
  })

  it("resolves a BYOK OpenAI assignment into a providerId-keyed byok config", () => {
    const provider = makeProvider({ id: "p1", type: "openai", serverProviderId: "srv-1", baseUrl: null })
    const assignments = {
      chat: { providerId: "p1", model: "gpt-4o" },
      transform: null,
    }
    const result = resolveRoleProvider("chat", [provider], assignments, {
      fallbackModel: "fallback",
    })
    expect(result.byok).toEqual({
      providerId: "srv-1",
      type: "openai",
      baseUrl: null,
      model: "gpt-4o",
    })
    expect(result.model).toBe("gpt-4o")
  })

  it("resolves an Anthropic assignment including a custom baseUrl", () => {
    const provider = makeProvider({
      id: "p2",
      type: "anthropic",
      serverProviderId: "srv-2",
      baseUrl: "https://custom.anthropic.com/v1",
    })
    const assignments = {
      chat: null,
      transform: { providerId: "p2", model: "claude-3-5-sonnet-20241022" },
    }
    const result = resolveRoleProvider("transform", [provider], assignments, {
      fallbackModel: "fallback",
    })
    expect(result.byok).toEqual({
      providerId: "srv-2",
      type: "anthropic",
      baseUrl: "https://custom.anthropic.com/v1",
      model: "claude-3-5-sonnet-20241022",
    })
  })

  it("resolves the transform role independently from chat", () => {
    const openai = makeProvider({ id: "oa", type: "openai", serverProviderId: "srv-oa" })
    const anthropic = makeProvider({ id: "an", type: "anthropic", serverProviderId: "srv-an" })
    const assignments = {
      chat: { providerId: "oa", model: "gpt-4o" },
      transform: { providerId: "an", model: "claude-3-5-sonnet-20241022" },
    }
    const chat = resolveRoleProvider("chat", [openai, anthropic], assignments, { fallbackModel: "f" })
    const transform = resolveRoleProvider("transform", [openai, anthropic], assignments, {
      fallbackModel: "f",
    })
    expect(chat.byok?.type).toBe("openai")
    expect(transform.byok?.type).toBe("anthropic")
  })

  it("falls back to Ollama when the assigned provider id is not present", () => {
    const assignments = {
      chat: { providerId: "missing", model: "gpt-4o" },
      transform: null,
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = resolveRoleProvider("chat", [makeProvider()], assignments, {
      fallbackModel: "llama3:8b",
    })
    expect(result.byok).toBeUndefined()
    expect(result.model).toBe("llama3:8b")
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("falls back to Ollama when the assigned provider is disabled", () => {
    const provider = makeProvider({ id: "p1", enabled: false })
    const assignments = {
      chat: { providerId: "p1", model: "gpt-4o" },
      transform: null,
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = resolveRoleProvider("chat", [provider], assignments, {
      fallbackModel: "llama3:8b",
    })
    expect(result.byok).toBeUndefined()
    expect(result.model).toBe("llama3:8b")
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("falls back to Ollama when the BYOK provider has no server-side key (serverProviderId null)", () => {
    const provider = makeProvider({ id: "p1", serverProviderId: null })
    const assignments = {
      chat: { providerId: "p1", model: "gpt-4o" },
      transform: null,
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = resolveRoleProvider("chat", [provider], assignments, {
      fallbackModel: "llama3:8b",
    })
    expect(result.byok).toBeUndefined()
    expect(result.model).toBe("llama3:8b")
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("falls back to Ollama when the BYOK provider has an empty serverProviderId", () => {
    const provider = makeProvider({ id: "p1", serverProviderId: "" })
    const assignments = {
      chat: { providerId: "p1", model: "gpt-4o" },
      transform: null,
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const result = resolveRoleProvider("chat", [provider], assignments, {
      fallbackModel: "llama3:8b",
    })
    expect(result.byok).toBeUndefined()
    expect(result.model).toBe("llama3:8b")
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("passes through a null fallback model when no assignment and no fallback given", () => {
    const result = resolveRoleProvider("chat", [makeProvider()], NO_ASSIGNMENTS, {
      fallbackModel: null,
    })
    expect(result.byok).toBeUndefined()
    expect(result.model).toBeNull()
  })

  it("treats openai_compatible providers with a baseUrl through the same path", () => {
    const provider = makeProvider({
      id: "p3",
      type: "openai_compatible",
      serverProviderId: "srv-3",
      baseUrl: "http://localhost:1234/v1",
    })
    const assignments = {
      chat: { providerId: "p3", model: "local-model" },
      transform: null,
    }
    const result = resolveRoleProvider("chat", [provider], assignments, { fallbackModel: "f" })
    expect(result.byok).toEqual({
      providerId: "srv-3",
      type: "openai_compatible",
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
    })
  })
})
