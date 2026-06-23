import { AlertTriangle } from 'lucide-react'

interface TransformConfirmDialogProps {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Confirmation modal shown when transforming the whole editor contents (no
 * text selection). Warns that variables, modifiers, and formatting are removed.
 */
export function TransformConfirmDialog({ open, onCancel, onConfirm }: TransformConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-[min(420px,92vw)] bg-slate-900 border border-amber-700/40 rounded-xl shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 text-amber-400">
          <AlertTriangle size={16} />
          <h2 className="font-semibold text-sm">Transform whole prompt?</h2>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs text-slate-300 leading-relaxed">
            No text is selected, so the entire editor contents will be replaced with the transformed
            result.
          </p>
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-md">
            <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-300 leading-relaxed">
              Any <span className="font-mono">{'{{variables}}'}</span>, modifiers, and formatting
              will be removed from the result.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-800">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md"
          >
            Transform all
          </button>
        </div>
      </div>
    </div>
  )
}
