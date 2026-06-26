import React, { useState } from "react"
import { motion } from "framer-motion"
import { Save, X } from "lucide-react"
import type { DatabaseConnectionRead, DbEngine } from "../../types"
import { ADDABLE_ENGINES, ENGINE_META } from "./engineMeta"
import { buildConnectionString, type GuidedFields } from "./connectionUrl"

export interface ConnectionSavePayload {
  label: string
  engine: DbEngine
  /** Present when a (new) connection string is provided; absent to leave the url unchanged in edit mode. */
  url?: string
}

export interface ConnectionEditModalProps {
  mode: "create" | "edit"
  initial?: DatabaseConnectionRead
  onSave: (payload: ConnectionSavePayload) => Promise<void>
  onClose: () => void
}

const EMPTY_GUIDED: GuidedFields = { host: "", port: "", database: "", username: "", password: "", path: "" }

export function ConnectionEditModal({ mode, initial, onSave, onClose }: ConnectionEditModalProps) {
  const [engine, setEngine] = useState<DbEngine>(initial?.engine ?? "postgresql")
  const [label, setLabel] = useState(initial?.label ?? ENGINE_META.postgresql.label)
  // Advanced mode = paste a full connection string. Guided mode = build it.
  const [advanced, setAdvanced] = useState(false)
  const [connectionString, setConnectionString] = useState("")
  const [guided, setGuided] = useState<GuidedFields>(() => {
    if (initial) {
      return {
        host: initial.host ?? "",
        port: initial.port ? String(initial.port) : "",
        database: initial.database ?? "",
        username: "",
        password: "",
        path: initial.database ?? "",
      }
    }
    return {
      ...EMPTY_GUIDED,
      port: ENGINE_META.postgresql.defaultPort ? String(ENGINE_META.postgresql.defaultPort) : "",
    }
  })
  const [saving, setSaving] = useState(false)

  const meta = ENGINE_META[engine]

  const onEngineChange = (e: DbEngine) => {
    setEngine(e)
    if (mode === "create") {
      setLabel(ENGINE_META[e].label)
      const defaultPort = ENGINE_META[e].defaultPort
      setGuided({ ...EMPTY_GUIDED, port: defaultPort ? String(defaultPort) : "" })
    }
  }

  const guidedUrl = buildConnectionString(engine, guided)

  // Resolve the connection string to save, plus whether one was supplied.
  const resolveUrl = (): { url: string | undefined; provided: boolean } => {
    if (advanced) {
      const u = connectionString.trim()
      return { url: u || undefined, provided: u.length > 0 }
    }
    if (mode === "create") {
      // Guided create requires a minimum target: a file path (sqlite) or
      // database name (postgres) so an empty localhost-only url can't be saved.
      const hasTarget = engine === "sqlite" ? guided.path.trim().length > 0 : guided.database.trim().length > 0
      return { url: guidedUrl, provided: hasTarget }
    }
    // edit + guided: only replace the connection if a password was entered.
    const provided = guided.password.trim().length > 0
    return { url: provided ? guidedUrl : undefined, provided }
  }

  const resolved = resolveUrl()
  const createNeedsUrl = mode === "create" && !resolved.provided
  const canSave = label.trim().length > 0 && !createNeedsUrl && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({ label: label.trim(), engine, url: resolved.url })
    } finally {
      setSaving(false)
    }
  }

  const fieldClass =
    "w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 font-mono"
  const labelClass = "block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            {mode === "create" ? "Add Database Connection" : `Edit ${initial?.label ?? "Connection"}`}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Engine (create only) */}
          {mode === "create" && (
            <div>
              <label className={labelClass}>Engine</label>
              <div className="grid grid-cols-1 gap-2">
                {ADDABLE_ENGINES.map((e) => {
                  const m = ENGINE_META[e]
                  const isActive = engine === e
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => onEngineChange(e)}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg text-left border transition-all ${
                        isActive
                          ? "bg-indigo-500/10 border-indigo-500/40"
                          : "bg-slate-950 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isActive ? "text-indigo-300" : "text-slate-200"}`}>
                          {m.label}
                        </p>
                        <p className="text-[11px] text-slate-500 leading-snug">{m.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Label */}
          <div>
            <label className={labelClass}>Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. My Postgres, Work DB"
              className={fieldClass}
            />
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 w-fit">
            <button
              type="button"
              onClick={() => setAdvanced(false)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                !advanced ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Guided
            </button>
            <button
              type="button"
              onClick={() => setAdvanced(true)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                advanced ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Connection string
            </button>
          </div>

          {advanced ? (
            <div>
              <label className={labelClass}>
                Connection string{" "}
                {mode === "edit" && <span className="text-slate-600 normal-case">(leave blank to keep current)</span>}
              </label>
              <input
                type="text"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder={
                  engine === "sqlite" ? "sqlite:////home/me/l1br3.db" : "postgresql://user:pass@host:5432/db"
                }
                className={fieldClass}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {engine === "sqlite" ? (
                <div>
                  <label className={labelClass}>File path</label>
                  <input
                    type="text"
                    value={guided.path}
                    onChange={(e) => setGuided({ ...guided, path: e.target.value })}
                    placeholder="/home/me/.l1br3/l1br3.db"
                    className={fieldClass}
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className={labelClass}>Host</label>
                      <input
                        type="text"
                        value={guided.host}
                        onChange={(e) => setGuided({ ...guided, host: e.target.value })}
                        placeholder="localhost"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Port</label>
                      <input
                        type="text"
                        value={guided.port}
                        onChange={(e) => setGuided({ ...guided, port: e.target.value })}
                        placeholder="5432"
                        className={fieldClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Database</label>
                    <input
                      type="text"
                      value={guided.database}
                      onChange={(e) => setGuided({ ...guided, database: e.target.value })}
                      placeholder="l1br3"
                      className={fieldClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Username</label>
                      <input
                        type="text"
                        value={guided.username}
                        onChange={(e) => setGuided({ ...guided, username: e.target.value })}
                        placeholder="user"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Password{" "}
                        {mode === "edit" && <span className="text-slate-600 normal-case">(enter to replace)</span>}
                      </label>
                      <input
                        type="password"
                        value={guided.password}
                        onChange={(e) => setGuided({ ...guided, password: e.target.value })}
                        placeholder={mode === "edit" ? "••••••" : "password"}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                </>
              )}
              {/* Live preview of the built connection string */}
              <div className="px-3 py-2 rounded-md bg-slate-950 border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Preview</p>
                <p className="text-xs font-mono text-slate-400 break-all">{guidedUrl}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Save size={14} /> {saving ? "Saving…" : mode === "create" ? "Add Connection" : "Save Changes"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
