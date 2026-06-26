import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, X } from "lucide-react"
import type { DatabaseConnectionRead, MigrationMeta, MigrationProgress } from "../../types"
import { migrateDatabase } from "../../lib/api"
import type { EngineMeta } from "./engineMeta"

export interface MigrationModalProps {
  connection: DatabaseConnectionRead
  meta: EngineMeta
  backendUrl: string
  /** Fired once on a successful migration so the parent can refresh its list. */
  onMigrated: () => void
  onClose: () => void
}

type Phase = "confirm" | "running" | "done" | "error"

export function MigrationModal({ connection, meta, backendUrl, onMigrated, onClose }: MigrationModalProps) {
  const [phase, setPhase] = useState<Phase>("confirm")
  const [plan, setPlan] = useState<MigrationMeta | null>(null)
  const [progressByTable, setProgressByTable] = useState<Record<string, MigrationProgress>>({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const run = async () => {
    setPhase("running")
    setErrorMsg(null)
    setProgressByTable({})
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await migrateDatabase(
        backendUrl,
        connection.id,
        {
          onMigrationMeta: (m) => setPlan(m),
          onProgress: (p) => setProgressByTable((prev) => ({ ...prev, [p.table]: p })),
        },
        controller.signal,
      )
      setPhase("done")
      onMigrated()
    } catch (err) {
      // The source stays active on failure; the backend rolled the target back.
      setErrorMsg(err instanceof Error ? err.message : "Migration failed.")
      setPhase("error")
    } finally {
      abortRef.current = null
    }
  }

  const close = () => {
    // Cancel any in-flight stream; the backend rolls the open transaction back.
    abortRef.current?.abort()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={phase === "running" ? undefined : close}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">Migrate &amp; activate</h3>
          <button
            onClick={close}
            disabled={phase === "running"}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {phase === "confirm" && (
            <>
              <p className="text-sm text-slate-300 leading-relaxed">
                Copy every prompt, tag, transform mode, and AI provider from the active database into{" "}
                <span className="text-slate-100 font-medium">{connection.label}</span>, then switch to it.
              </p>
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 font-mono">
                  {meta.label}
                </span>
                <ArrowRight size={11} />
                <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 font-mono truncate max-w-[16rem]">
                  {connection.maskedUrl}
                </span>
              </div>
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  The target must be empty. On any failure the copy is rolled back and the current database stays
                  active.
                </span>
              </div>
            </>
          )}

          {(phase === "running" || phase === "done") && plan && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider">
                {plan.sourceEngine} → {plan.targetEngine}
              </p>
              {plan.tables.map((table) => {
                const p = progressByTable[table]
                const isDone = p?.phase === "done"
                const isCopying = p?.phase === "copying"
                return (
                  <div
                    key={table}
                    className="flex items-center justify-between px-3 py-1.5 rounded-md bg-slate-950 border border-slate-800"
                  >
                    <span className="text-xs font-mono text-slate-300">{table}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      {isDone ? (
                        <CheckCircle2 size={12} className="text-emerald-400" />
                      ) : isCopying ? (
                        <Loader2 size={12} className="text-indigo-400 animate-spin" />
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                      {p ? `${p.copied}/${p.total}` : ""}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {phase === "done" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
              <CheckCircle2 size={13} /> Migration complete — {connection.label} is now active.
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span className="break-all">{errorMsg ?? "Migration failed."}</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                The current database is still active; nothing was changed. Fix the issue and try again.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-end gap-2">
          {phase === "confirm" && (
            <>
              <button
                onClick={close}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={run}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Migrate
              </button>
            </>
          )}
          {phase === "running" && (
            <button
              onClick={close}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
            >
              Cancel
            </button>
          )}
          {(phase === "done" || phase === "error") && (
            <button
              onClick={close}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
            >
              Close
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
