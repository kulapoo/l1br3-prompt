import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, X, ArrowLeftCircle, ArrowRightCircle, Pencil } from 'lucide-react'
import {
  removeConflict,
  setWatermark,
  type Conflict,
  type PromptSnapshot,
} from '../lib/conflicts'
import { useConflicts } from '../hooks/useConflicts'
import { updatePrompt } from '../lib/api'
import { useAppConfig } from '../contexts/AppConfig'

interface ConflictDialogProps {
  open: boolean
  onClose: () => void
}

type Mode = 'review' | 'manual'

const FIELD_LABELS: Array<[keyof PromptSnapshot, string]> = [
  ['title', 'Title'],
  ['content', 'Content'],
  ['category', 'Category'],
  ['tags', 'Tags'],
  ['isFavorite', 'Favorite'],
]

function fieldsDiffer(a: PromptSnapshot, b: PromptSnapshot, key: keyof PromptSnapshot): boolean {
  const av = a[key]
  const bv = b[key]
  if (Array.isArray(av) && Array.isArray(bv)) {
    return JSON.stringify([...av].sort()) !== JSON.stringify([...bv].sort())
  }
  return av !== bv
}

function renderValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ') || '—'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

export function ConflictDialog({ open, onClose }: ConflictDialogProps) {
  const { conflicts } = useConflicts()
  const { config } = useAppConfig()
  const backendUrl = config.backend.url

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('review')
  const [draft, setDraft] = useState<PromptSnapshot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default selection: first conflict in the list
  useEffect(() => {
    if (!open) return
    if (selectedId && conflicts.find((c) => c.id === selectedId)) return
    setSelectedId(conflicts[0]?.id ?? null)
    setMode('review')
    setDraft(null)
    setError(null)
  }, [open, conflicts, selectedId])

  const current: Conflict | undefined = useMemo(
    () => conflicts.find((c) => c.id === selectedId),
    [conflicts, selectedId],
  )

  if (!open) return null

  async function resolve(chosen: PromptSnapshot) {
    if (!current) return
    setSubmitting(true)
    setError(null)
    try {
      await updatePrompt(backendUrl, current.promptId, {
        title: chosen.title,
        content: chosen.content,
        category: chosen.category,
        isFavorite: chosen.isFavorite,
        tags: chosen.tags.map((name) => ({ name })),
      })
      await removeConflict(current.id)
      // Watermark advances past the remote side we just diverged from — next sync
      // will treat the resolved write as the new common base once it round-trips.
      await setWatermark(current.promptId, current.remote.updatedAt)
      setMode('review')
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve conflict')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-[min(720px,95vw)] max-h-[90vh] flex flex-col bg-slate-900 border border-amber-700/40 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={16} />
            <h2 className="font-semibold text-sm">
              Sync conflicts
              {conflicts.length > 0 && (
                <span className="ml-2 text-xs text-slate-400 font-normal">
                  {conflicts.length} pending
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Close conflict dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        {conflicts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No pending conflicts.
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left rail */}
            <ul className="w-40 shrink-0 border-r border-slate-800 overflow-y-auto">
              {conflicts.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setSelectedId(c.id)
                      setMode('review')
                      setDraft(null)
                      setError(null)
                    }}
                    className={`w-full text-left px-3 py-2 text-xs border-b border-slate-800 truncate ${
                      c.id === selectedId
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:bg-slate-800/50'
                    }`}
                  >
                    {c.local.title || c.remote.title || c.promptId}
                  </button>
                </li>
              ))}
            </ul>

            {/* Right pane */}
            <div className="flex-1 overflow-y-auto p-4">
              {current && mode === 'review' && (
                <ReviewPane
                  conflict={current}
                  onPickLocal={() => resolve(current.local)}
                  onPickRemote={() => resolve(current.remote)}
                  onEdit={() => {
                    setDraft({ ...current.local })
                    setMode('manual')
                  }}
                  submitting={submitting}
                  error={error}
                />
              )}
              {current && mode === 'manual' && draft && (
                <ManualPane
                  draft={draft}
                  setDraft={setDraft}
                  onCancel={() => {
                    setMode('review')
                    setDraft(null)
                  }}
                  onSubmit={() => resolve(draft)}
                  submitting={submitting}
                  error={error}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ReviewPaneProps {
  conflict: Conflict
  onPickLocal: () => void
  onPickRemote: () => void
  onEdit: () => void
  submitting: boolean
  error: string | null
}

function ReviewPane({
  conflict,
  onPickLocal,
  onPickRemote,
  onEdit,
  submitting,
  error,
}: ReviewPaneProps) {
  return (
    <div className="space-y-4">
      <div className="text-xs text-slate-400">
        Both your local copy and a remote device edited this prompt since the last sync. Pick a
        version, or edit manually.
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-950/60 border border-slate-800 rounded-md">
          <div className="px-3 py-2 border-b border-slate-800 text-indigo-300 font-medium">
            This device
          </div>
          <FieldList snapshot={conflict.local} other={conflict.remote} />
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-md">
          <div className="px-3 py-2 border-b border-slate-800 text-emerald-300 font-medium">
            Remote
          </div>
          <FieldList snapshot={conflict.remote} other={conflict.local} />
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-rose-950/50 border border-rose-800 text-rose-300 text-xs rounded">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={onPickLocal}
          disabled={submitting}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md"
        >
          <ArrowLeftCircle size={12} /> Keep mine
        </button>
        <button
          onClick={onPickRemote}
          disabled={submitting}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md"
        >
          <ArrowRightCircle size={12} /> Use theirs
        </button>
        <button
          onClick={onEdit}
          disabled={submitting}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-100 rounded-md"
        >
          <Pencil size={12} /> Edit manually
        </button>
      </div>
    </div>
  )
}

function FieldList({ snapshot, other }: { snapshot: PromptSnapshot; other: PromptSnapshot }) {
  return (
    <dl className="p-3 space-y-2">
      {FIELD_LABELS.map(([key, label]) => {
        const differs = fieldsDiffer(snapshot, other, key)
        return (
          <div key={key} className={differs ? 'rounded bg-amber-950/30 -mx-1 px-1 py-0.5' : ''}>
            <dt className="text-[10px] uppercase tracking-wider text-slate-500">{label}</dt>
            <dd className="text-slate-200 whitespace-pre-wrap break-words text-xs">
              {renderValue(snapshot[key])}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

interface ManualPaneProps {
  draft: PromptSnapshot
  setDraft: (d: PromptSnapshot) => void
  onCancel: () => void
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

function ManualPane({ draft, setDraft, onCancel, onSubmit, submitting, error }: ManualPaneProps) {
  return (
    <div className="space-y-3 text-xs">
      <div className="text-slate-400">Edit the resolved version manually.</div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Title</span>
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Content</span>
        <textarea
          value={draft.content}
          onChange={(e) => setDraft({ ...draft, content: e.target.value })}
          rows={6}
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono"
        />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Category</span>
        <input
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          Tags (comma-separated)
        </span>
        <input
          value={draft.tags.join(', ')}
          onChange={(e) =>
            setDraft({
              ...draft,
              tags: e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
        />
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.isFavorite}
          onChange={(e) => setDraft({ ...draft, isFavorite: e.target.checked })}
        />
        <span className="text-slate-300">Favorite</span>
      </label>

      {error && (
        <div className="px-3 py-2 bg-rose-950/50 border border-rose-800 text-rose-300 rounded">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md"
        >
          <Check size={12} /> Resolve
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-100 rounded-md"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
