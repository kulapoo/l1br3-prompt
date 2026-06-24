import { useRef, useState } from "react"
import { Wand2, X, RefreshCw, Plus } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { useAppConfig } from "../contexts/AppConfig"
import { useTransformModes } from "../hooks/useTransformModes"
import { streamTransform } from "../lib/api"
import { resolveRoleProvider } from "../lib/roleRouter"
import { TransformConfirmDialog } from "./TransformConfirmDialog"

interface TransformPanelProps {
  editor: Editor | null
}

/**
 * In-compose transform panel. Lets the user apply one or more AI transform
 * modes to the editor's current text selection (or the whole prompt when no
 * selection is present). Modes can be combined; custom instructions can be
 * saved as reusable modes.
 */
export function TransformPanel({ editor }: TransformPanelProps) {
  const { config, updateConfig } = useAppConfig()
  const { modes, createMode, removeMode } = useTransformModes()

  const [selected, setSelected] = useState<string[]>([])
  const [customInstruction, setCustomInstruction] = useState("")
  const [customName, setCustomName] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<"ollama" | string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const aiAvailable = config.backend.isInstalled && config.ai.availableModels.length > 0

  const editorEmpty = !editor?.getText().trim()
  const wantsCustom = selected.includes("custom")

  // Disabled when no mode is selected (and not streaming — during streaming the
  // button flips to a Cancel affordance and must stay enabled).
  const canTransform = aiAvailable && selected.length > 0 && !editorEmpty
  const buttonDisabled = !canTransform && !isStreaming

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  const runTransform = async (whole: boolean) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const target = whole ? editor.getText() : editor.state.doc.textBetween(from, to, " ")
    if (!target.trim()) return

    abortRef.current = new AbortController()
    setIsStreaming(true)
    setError(null)

    const resolved = resolveRoleProvider("transform", config.ai.providers, config.ai.assignments, {
      fallbackModel: config.ai.selectedModel,
    })

    let result = ""
    try {
      await streamTransform(
        config.backend.url,
        {
          prompt: target,
          modes: selected,
          instruction: wantsCustom ? customInstruction.trim() || undefined : undefined,
          model: resolved.model,
          byok: resolved.byok,
        },
        (chunk) => {
          result += chunk
        },
        abortRef.current.signal,
        {
          onMeta: (m) => {
            setProvider(m.provider)
            updateConfig({ ai: { ...config.ai, activeProvider: m.provider } })
          },
        },
      )
      if (!result.trim()) return
      if (whole) {
        editor.commands.setContent(result)
      } else {
        editor.chain().focus().setTextSelection({ from, to }).deleteSelection().insertContent(result).run()
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message)
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const handleTransformClick = () => {
    if (!editor) return
    if (isStreaming) {
      abortRef.current?.abort()
      return
    }
    const { from, to } = editor.state.selection
    if (from === to) {
      // No selection -> transform whole prompt (requires confirmation).
      setConfirmOpen(true)
      return
    }
    void runTransform(false)
  }

  const handleConfirm = () => {
    setConfirmOpen(false)
    void runTransform(true)
  }

  const handleSaveCustom = () => {
    const name = customName.trim()
    const instruction = customInstruction.trim()
    if (!name || !instruction) return
    createMode.mutate(
      { name, instruction },
      {
        onSuccess: () => {
          setCustomName("")
          setCustomInstruction("")
          setSelected((prev) => prev.filter((m) => m !== "custom"))
        },
        onError: (e) => setError(e.message),
      },
    )
  }

  if (!aiAvailable) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <Wand2 size={12} className="text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Transform</h3>
        </div>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          AI not available. Connect Ollama in Settings to transform prompts.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 size={12} className="text-indigo-400" />
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Transform</h3>
        </div>
        {provider && <span className="text-[9px] text-slate-500 uppercase tracking-wider">{provider}</span>}
      </div>

      {/* Mode chips (built-in + saved custom) */}
      <div className="flex flex-wrap gap-1.5">
        {modes.map((mode) => {
          const active = selected.includes(mode.id)
          return (
            <div key={mode.id} className="relative group">
              <button
                onClick={() => toggle(mode.id)}
                className={`text-[10px] px-2 py-1 rounded-md border transition-colors ${active ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600"}`}
              >
                {mode.name}
              </button>
              {!mode.isBuiltin && (
                <button
                  onClick={() => removeMode.mutate(mode.id)}
                  title="Delete mode"
                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={8} />
                </button>
              )}
            </div>
          )
        })}
        {/* Custom pseudo-mode */}
        <button
          onClick={() => toggle("custom")}
          className={`text-[10px] px-2 py-1 rounded-md border transition-colors flex items-center gap-1 ${wantsCustom ? "bg-purple-500/20 text-purple-300 border-purple-500/40" : "bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600"}`}
        >
          <Plus size={9} /> Custom
        </button>
      </div>

      {/* Custom instruction + save-as-mode */}
      {wantsCustom && (
        <div className="space-y-2">
          <textarea
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="Describe how to transform the text..."
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex items-center gap-2">
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Save as mode (name)"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleSaveCustom}
              disabled={!customName.trim() || !customInstruction.trim() || createMode.isPending}
              className="px-2 py-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md"
            >
              {createMode.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Error / quota */}
      {error && (
        <div className="flex items-start gap-2 px-2 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-md">
          <span className="text-rose-400 text-[10px] leading-relaxed flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-500/60 hover:text-rose-400">
            <X size={11} />
          </button>
        </div>
      )}

      {/* Transform / Cancel */}
      <button
        onClick={handleTransformClick}
        disabled={buttonDisabled}
        className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${isStreaming ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"}`}
      >
        {isStreaming ? (
          <>
            <RefreshCw size={13} className="animate-spin" /> Cancel
          </>
        ) : (
          <>
            <Wand2 size={13} /> Transform
          </>
        )}
      </button>

      <p className="text-[9px] text-slate-600 leading-relaxed">
        Select text to transform just the selection, or transform the whole prompt. Placeholders like
        <span className="font-mono"> {"{{variable}}"} </span> will be removed from the result.
      </p>

      <TransformConfirmDialog open={confirmOpen} onCancel={() => setConfirmOpen(false)} onConfirm={handleConfirm} />
    </div>
  )
}
