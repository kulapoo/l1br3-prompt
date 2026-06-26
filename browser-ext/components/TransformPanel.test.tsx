import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import type { AppConfig } from "../contexts/AppConfig"
import type { Editor } from "@tiptap/react"
import type { TransformMode } from "../types"

// Hoisted spies survive vi.clearAllMocks() so the hook mock never returns
// undefined (avoids a cross-file QueryClient leak in the full suite).
const mocks = vi.hoisted(() => ({
  builtins: [
    { id: "summarize", name: "Summarize", instruction: "Be concise", isBuiltin: true },
    { id: "concise", name: "Make Concise", instruction: "Strip filler", isBuiltin: true },
  ] as TransformMode[],
  createMode: { mutate: vi.fn(), isPending: false },
  removeMode: { mutate: vi.fn(), isPending: false },
}))

// Editor mock: configurable selection + text. The chainable proxy mirrors the
// pattern in ComposeTab.test.tsx — every method is a no-op returning the chain.
const chainFocus: Record<string, (...a: unknown[]) => typeof chainFocus> = new Proxy(
  {},
  {
    get:
      () =>
      (..._a: unknown[]) =>
        chainFocus,
  },
)
Object.assign(chainFocus, { run: vi.fn() })

function makeEditor(opts: { text?: string; from?: number; to?: number } = {}): Editor {
  const text = opts.text ?? "Some prompt text"
  const from = opts.from ?? 0
  const to = opts.to ?? 0
  return {
    commands: { setContent: vi.fn(), clearContent: vi.fn() },
    chain: () => chainFocus,
    state: {
      selection: { from, to },
      doc: { textBetween: (f: number, t: number) => text.slice(f, t) },
    },
    getText: () => text,
  } as unknown as Editor
}

vi.mock("../lib/api", () => ({
  streamTransform: vi.fn(async (_url: string, _body: unknown, onChunk: (c: string) => void) => {
    onChunk("transformed ")
    onChunk("text")
  }),
}))

vi.mock("../contexts/AppConfig", () => ({ useAppConfig: vi.fn() }))
vi.mock("../hooks/useTransformModes", () => ({
  useTransformModes: () => ({
    modes: mocks.builtins,
    isLoading: false,
    createMode: mocks.createMode,
    removeMode: mocks.removeMode,
  }),
}))

import { useAppConfig } from "../contexts/AppConfig"
import * as api from "../lib/api"
import { TransformPanel } from "./TransformPanel"

const baseConfig: AppConfig = {
  backend: { isInstalled: true, url: "http://localhost:8000" },
  ai: {
    localConnected: true,
    activeProvider: null,
    selectedModel: "llama3:8b",
    availableModels: ["llama3:8b"],
    providers: [],
    assignments: { chat: null, transform: null },
  },
  viewMode: "sidebar",
  quickActions: [],
}

const ctx = {
  config: baseConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateAi: vi.fn(),
  activeTab: "compose" as const,
  setActiveTab: vi.fn(),
  editingPrompt: null,
  setEditingPrompt: vi.fn(),
}

let editor: Editor = makeEditor()

beforeEach(() => {
  vi.clearAllMocks()
  editor = makeEditor({ text: "Some prompt text" })
  vi.mocked(useAppConfig).mockReturnValue(ctx)
})

describe("TransformPanel", () => {
  it("renders available transform modes as chips", () => {
    render(<TransformPanel editor={editor} />)
    expect(screen.getByText("Summarize")).toBeTruthy()
    expect(screen.getByText("Make Concise")).toBeTruthy()
    expect(screen.getByText("Custom")).toBeTruthy()
  })

  it("disables the Transform button when no mode is selected", () => {
    render(<TransformPanel editor={editor} />)
    expect((screen.getByRole("button", { name: "Transform" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("enables the Transform button once a mode is selected", () => {
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Summarize"))
    expect((screen.getByRole("button", { name: "Transform" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("toggles mode selection on click", () => {
    render(<TransformPanel editor={editor} />)
    const chip = screen.getByText("Summarize").closest("button")!
    fireEvent.click(chip)
    expect(chip.className).toContain("indigo")
    fireEvent.click(chip)
    expect(chip.className).not.toContain("indigo")
  })

  it("transforms the selected text when a selection is present", async () => {
    editor = makeEditor({ text: "Hello world prompt", from: 0, to: 5 })
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Summarize"))
    fireEvent.click(screen.getByRole("button", { name: "Transform" }))

    await waitFor(() => expect(api.streamTransform).toHaveBeenCalled())
    const [, body] = vi.mocked(api.streamTransform).mock.calls[0]
    expect((body as { prompt: string }).prompt).toBe("Hello")
    expect((body as { modes: string[] }).modes).toEqual(["summarize"])
  })

  it("opens a confirmation dialog when no text is selected", () => {
    editor = makeEditor({ text: "Whole prompt", from: 0, to: 0 })
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Summarize"))
    fireEvent.click(screen.getByRole("button", { name: "Transform" }))

    expect(screen.getByText("Transform whole prompt?")).toBeTruthy()
  })

  it("transforms the whole prompt after confirmation", async () => {
    editor = makeEditor({ text: "Whole prompt text", from: 0, to: 0 })
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Summarize"))
    fireEvent.click(screen.getByRole("button", { name: "Transform" }))
    fireEvent.click(screen.getByText("Transform all"))

    await waitFor(() => expect(api.streamTransform).toHaveBeenCalled())
    const [, body] = vi.mocked(api.streamTransform).mock.calls[0]
    expect((body as { prompt: string }).prompt).toBe("Whole prompt text")
  })

  it("combines multiple selected modes into one request", async () => {
    editor = makeEditor({ text: "Hello", from: 0, to: 5 })
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Summarize"))
    fireEvent.click(screen.getByText("Make Concise"))
    fireEvent.click(screen.getByRole("button", { name: "Transform" }))

    await waitFor(() => expect(api.streamTransform).toHaveBeenCalled())
    const [, body] = vi.mocked(api.streamTransform).mock.calls[0]
    expect((body as { modes: string[] }).modes).toEqual(["summarize", "concise"])
  })

  it("reveals the custom instruction + save form when Custom is selected", () => {
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Custom"))
    expect(screen.getByPlaceholderText("Describe how to transform the text...")).toBeTruthy()
    expect(screen.getByPlaceholderText("Save as mode (name)")).toBeTruthy()
  })

  it("saves a custom mode via the mutation", () => {
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Custom"))
    fireEvent.change(screen.getByPlaceholderText("Describe how to transform the text..."), {
      target: { value: "Make it funny" },
    })
    fireEvent.change(screen.getByPlaceholderText("Save as mode (name)"), {
      target: { value: "Funny" },
    })
    fireEvent.click(screen.getByText("Save"))

    expect(mocks.createMode.mutate).toHaveBeenCalledWith(
      { name: "Funny", instruction: "Make it funny" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it("sends the custom instruction when transforming with Custom selected", async () => {
    editor = makeEditor({ text: "Hello", from: 0, to: 5 })
    render(<TransformPanel editor={editor} />)
    fireEvent.click(screen.getByText("Custom"))
    fireEvent.change(screen.getByPlaceholderText("Describe how to transform the text..."), {
      target: { value: "Add emojis" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Transform" }))

    await waitFor(() => expect(api.streamTransform).toHaveBeenCalled())
    const [, body] = vi.mocked(api.streamTransform).mock.calls[0]
    expect((body as { modes: string[] }).modes).toContain("custom")
    expect((body as { instruction?: string }).instruction).toBe("Add emojis")
  })

  it("shows a disabled banner when AI is unavailable", () => {
    vi.mocked(useAppConfig).mockReturnValue({
      ...ctx,
      config: { ...baseConfig, ai: { ...baseConfig.ai, availableModels: [] } },
    })
    render(<TransformPanel editor={editor} />)
    expect(screen.getByText(/AI not available/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Transform" })).toBeNull()
  })

  describe("role-aware transform routing (M2)", () => {
    const anthropicProvider: AppConfig["ai"]["providers"][number] = {
      id: "p-an",
      type: "anthropic",
      label: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      serverProviderId: "srv-an",
      hasKey: true,
      enabled: true,
      capabilities: ["language"],
      models: ["claude-3-5-sonnet-20241022"],
      configured: true,
    }

    async function runTransform() {
      editor = makeEditor({ text: "Hello world prompt", from: 0, to: 5 })
      render(<TransformPanel editor={editor} />)
      fireEvent.click(screen.getByText("Summarize"))
      fireEvent.click(screen.getByRole("button", { name: "Transform" }))
      await waitFor(() => expect(api.streamTransform).toHaveBeenCalled())
      return vi.mocked(api.streamTransform).mock.calls[0][1] as {
        model?: string | null
        byok?: { providerId: string; type: string; baseUrl: string | null; model: string } | null
      }
    }

    it("forwards the transform BYOK assignment as a byok field", async () => {
      vi.mocked(useAppConfig).mockReturnValue({
        ...ctx,
        config: {
          ...baseConfig,
          ai: {
            ...baseConfig.ai,
            providers: [anthropicProvider],
            assignments: {
              chat: null,
              transform: { providerId: "p-an", model: "claude-3-5-sonnet-20241022" },
            },
          },
        },
      })

      const body = await runTransform()
      expect(body.byok).toEqual({
        providerId: "srv-an",
        type: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        model: "claude-3-5-sonnet-20241022",
      })
      expect(body.model).toBe("claude-3-5-sonnet-20241022")
    })

    it("omits byok and uses the local fallback when transform has no assignment", async () => {
      vi.mocked(useAppConfig).mockReturnValue(ctx)
      const body = await runTransform()
      expect(body.byok).toBeUndefined()
      expect(body.model).toBe("llama3:8b")
    })

    it("routes transform independently of chat (chat BYOK does not leak into transform)", async () => {
      const openAiProvider: AppConfig["ai"]["providers"][number] = {
        id: "p-oa",
        type: "openai",
        label: "OpenAI",
        baseUrl: null,
        serverProviderId: "srv-oa",
        hasKey: true,
        enabled: true,
        capabilities: ["language"],
        models: ["gpt-4o"],
        configured: true,
      }
      vi.mocked(useAppConfig).mockReturnValue({
        ...ctx,
        config: {
          ...baseConfig,
          ai: {
            ...baseConfig.ai,
            providers: [anthropicProvider, openAiProvider],
            assignments: {
              chat: { providerId: "p-oa", model: "gpt-4o" },
              transform: { providerId: "p-an", model: "claude-3-5-sonnet-20241022" },
            },
          },
        },
      })

      const body = await runTransform()
      expect(body.byok?.type).toBe("anthropic")
      expect(body.model).toBe("claude-3-5-sonnet-20241022")
    })
  })
})
