import React from "react"
import { AlertTriangle, CheckCircle2, Database, KeyRound, Pencil, Trash2, Zap } from "lucide-react"
import type { DatabaseConnectionRead } from "../../types"
import type { EngineMeta } from "./engineMeta"

export type TestState = "idle" | "testing" | "ok" | "fail"

export interface ConnectionCardProps {
  meta: EngineMeta
  connection: DatabaseConnectionRead
  testState?: TestState
  onTest?: () => void
  onActivate?: () => void
  onMigrate?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "emerald" | "indigo" | "slate" | "amber"
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    slate: "bg-slate-900 text-slate-500 border-slate-800",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function ConnectionCard({
  meta,
  connection,
  testState = "idle",
  onTest,
  onActivate,
  onMigrate,
  onEdit,
  onDelete,
}: ConnectionCardProps) {
  const { isActive, isDefault, hasPassword, maskedUrl, label } = connection

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-100 flex items-center gap-1.5">
              <Database size={13} className="text-slate-400" />
              {label}
            </p>
            {isActive && (
              <Badge tone="indigo">
                <CheckCircle2 size={9} /> Active
              </Badge>
            )}
            {connection.undecryptable && (
              <Badge tone="amber">
                <AlertTriangle size={9} /> Undecryptable
              </Badge>
            )}
            {isDefault && <Badge tone="slate">Default</Badge>}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{meta.description}</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2 flex-1">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-950 border border-slate-800">
          <KeyRound size={12} className={hasPassword ? "text-emerald-400" : "text-slate-600"} />
          <span className={`text-xs font-mono truncate ${hasPassword ? "text-slate-400" : "text-slate-600"}`}>
            {maskedUrl}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-end gap-1.5 bg-slate-900/40">
        {!isActive && onActivate && (
          <button
            type="button"
            onClick={onActivate}
            title="Set as active database"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-300 border border-slate-800 hover:bg-slate-800 transition-colors"
          >
            Activate
          </button>
        )}
        {!isActive && onMigrate && (
          <button
            type="button"
            onClick={onMigrate}
            title="Copy data from the active database into this one, then switch"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
          >
            Migrate &amp; activate
          </button>
        )}
        {!meta.fixed && onTest && (
          <button
            type="button"
            onClick={onTest}
            title="Test connection"
            className={`p-1.5 rounded-md transition-colors border ${
              testState === "ok"
                ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : testState === "fail"
                  ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                  : "text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Zap size={13} />
          </button>
        )}
        {!meta.fixed && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="Edit connection"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-300 border border-slate-800 hover:bg-slate-800 transition-colors"
          >
            <Pencil size={12} /> Edit
          </button>
        )}
        {!meta.fixed && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete connection"
            className="p-1.5 rounded-md text-slate-400 border border-slate-800 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
