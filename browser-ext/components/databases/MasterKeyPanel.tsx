import { useCallback, useEffect, useState } from "react"
import { Download, Upload, Key } from "lucide-react"

import { useAppConfig } from "../../contexts/AppConfig"
import { exportMasterKey, getMasterKeyStatus, importMasterKey } from "../../lib/api"
import type { MasterKeyBundle, MasterKeyStatus } from "../../types"

type Modal = "export" | "import" | null

export function MasterKeyPanel() {
  const { config } = useAppConfig()
  const backendUrl = config.backend.url

  const [status, setStatus] = useState<MasterKeyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatus(await getMasterKeyStatus(backendUrl))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read master-key status.")
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  useEffect(() => {
    load()
  }, [load])

  const statusText = (() => {
    if (loading || !status) return "Checking…"
    if (status.envOverride) return "Present · env override"
    if (status.present) return "Present · file"
    return "Missing"
  })()

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-indigo-400">
        <Key size={14} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Master key</span>
      </div>
      <p className="text-sm text-slate-400">
        Status: <span className="text-slate-200">{statusText}</span>
      </p>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Move your encryption key between hosts so migrated DB credentials and provider keys decrypt correctly. The
        export file is passphrase-protected; store it securely.
      </p>

      {error && (
        <div className="px-3 py-2 rounded-md bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {error}
        </div>
      )}
      {success && (
        <div className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
          {success}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setModal("export")
            setError(null)
            setSuccess(null)
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-slate-300 hover:text-slate-100 border border-slate-700 hover:border-slate-600 transition-colors"
        >
          <Download size={12} /> Export master key…
        </button>
        <button
          type="button"
          onClick={() => {
            setModal("import")
            setError(null)
            setSuccess(null)
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-slate-300 hover:text-slate-100 border border-slate-700 hover:border-slate-600 transition-colors"
        >
          <Upload size={12} /> Import master key…
        </button>
      </div>

      {modal === "export" && (
        <ExportModal
          onClose={() => setModal(null)}
          onSubmit={async (passphrase) => {
            setBusy(true)
            setError(null)
            try {
              const { bundle, warning } = await exportMasterKey(backendUrl, passphrase)
              const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" })
              const url = URL.createObjectURL(blob)
              const a = document.createElement("a")
              a.href = url
              a.download = "l1br3-master-key.json"
              a.style.display = "none"
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              URL.revokeObjectURL(url)
              setSuccess(
                warning
                  ? `Exported. Warning: ${warning}`
                  : "Exported. Store the file securely — it's protected only by your passphrase.",
              )
              setModal(null)
            } catch (err) {
              setError(err instanceof Error ? err.message : "Export failed.")
            } finally {
              setBusy(false)
            }
          }}
          busy={busy}
        />
      )}

      {modal === "import" && (
        <ImportModal
          overwriteWarning={status?.present === true}
          onClose={() => setModal(null)}
          onSubmit={async (passphrase, bundle) => {
            setBusy(true)
            setError(null)
            try {
              await importMasterKey(backendUrl, passphrase, bundle)
              setSuccess("Master key imported. Decrypt should now work for migrated secrets.")
              setModal(null)
              await load()
            } catch (err) {
              setError(err instanceof Error ? err.message : "Import failed.")
            } finally {
              setBusy(false)
            }
          }}
          busy={busy}
        />
      )}
    </section>
  )
}

// ── Export modal ────────────────────────────────────────────────────────────

interface ExportModalProps {
  onClose: () => void
  onSubmit: (passphrase: string) => Promise<void>
  busy: boolean
}

function ExportModal({ onClose, onSubmit, busy }: ExportModalProps) {
  const [passphrase, setPassphrase] = useState("")
  const [confirm, setConfirm] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const handleDownload = () => {
    if (passphrase !== confirm) {
      setLocalError("Passphrases do not match.")
      return
    }
    if (!passphrase) {
      setLocalError("Passphrase required.")
      return
    }
    setLocalError(null)
    void onSubmit(passphrase)
  }

  return (
    <ModalShell title="Export master key" onClose={onClose}>
      <p className="text-xs text-slate-400 leading-relaxed">
        Choose a passphrase. The exported file is protected only by this passphrase — there is no recovery if you forget
        it.
      </p>
      <LabeledInput label="Passphrase" type="password" value={passphrase} onChange={setPassphrase} />
      <LabeledInput label="Confirm passphrase" type="password" value={confirm} onChange={setConfirm} />
      {localError && <p className="text-xs text-rose-300">{localError}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          <Download size={12} /> Download
        </button>
      </div>
    </ModalShell>
  )
}

// ── Import modal ────────────────────────────────────────────────────────────

interface ImportModalProps {
  overwriteWarning: boolean
  onClose: () => void
  onSubmit: (passphrase: string, bundle: MasterKeyBundle) => Promise<void>
  busy: boolean
}

function ImportModal({ overwriteWarning, onClose, onSubmit, busy }: ImportModalProps) {
  const [passphrase, setPassphrase] = useState("")
  const [bundleText, setBundleText] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)

  const handleImport = () => {
    if (!passphrase) {
      setLocalError("Passphrase required.")
      return
    }
    let bundle: MasterKeyBundle
    try {
      bundle = JSON.parse(bundleText) as MasterKeyBundle
    } catch {
      setLocalError("Bundle is not valid JSON.")
      return
    }
    setLocalError(null)
    void onSubmit(passphrase, bundle)
  }

  return (
    <ModalShell title="Import master key" onClose={onClose}>
      {overwriteWarning && (
        <div className="px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          This replaces your existing master key. Any provider keys or DB credentials encrypted under the old key will
          need to be re-entered.
        </div>
      )}
      <p className="text-xs text-slate-400 leading-relaxed">
        Paste the contents of the exported <code>l1br3-master-key.json</code> file and enter the passphrase you chose at
        export time.
      </p>
      <textarea
        data-testid="import-bundle-textarea"
        placeholder='{"version": 1, "kdf": "scrypt", …}'
        value={bundleText}
        onChange={(e) => setBundleText(e.target.value)}
        rows={6}
        className="w-full rounded-md bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
      />
      <LabeledInput label="Passphrase" type="password" value={passphrase} onChange={setPassphrase} />
      {localError && <p className="text-xs text-rose-300">{localError}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          <Upload size={12} /> Import key
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────────

interface LabeledInputProps {
  label: string
  type: "text" | "password"
  value: string
  onChange: (v: string) => void
}

function LabeledInput({ label, type, value, onChange }: LabeledInputProps) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-400 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
      />
    </label>
  )
}

interface ModalShellProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {children}
      </div>
    </div>
  )
}
