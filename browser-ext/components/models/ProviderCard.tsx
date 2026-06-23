import React from 'react';
import { CheckCircle2, Pencil, Trash2, Zap, Boxes, Plus, KeyRound } from 'lucide-react';
import type { ProviderCapability } from '../../types';
import { ALL_CAPABILITIES, type ProviderMeta } from './providerMeta';

export type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export interface ProviderCardProps {
  meta: ProviderMeta;
  configured: boolean;
  enabled: boolean;
  apiKey?: string | null;
  capabilities?: ProviderCapability[];
  models?: string[];
  fixed?: boolean;
  testState?: TestState;
  /** Extra node rendered in the body (e.g. cloud quota bar, ollama hint). */
  extra?: React.ReactNode;
  onToggle?: (enabled: boolean) => void;
  onTest?: () => void;
  onModels?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAdd?: () => void;
  onRemoveModel?: (model: string) => void;
}

function CapabilityPill({ cap, active }: { cap: { id: ProviderCapability; label: string }; active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
        active
          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
          : 'bg-slate-900 text-slate-600 border-slate-800'
      }`}
    >
      {cap.label}
    </span>
  );
}

function MaskedKey({ present }: { present: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-950 border border-transparent hover:border-slate-700 transition-colors">
      <KeyRound size={12} className={present ? 'text-emerald-400' : 'text-slate-600'} />
      <span className={`text-xs font-mono ${present ? 'text-slate-400' : 'text-slate-600'}`}>
        {present ? '••••••••••••••••' : 'not set'}
      </span>
    </div>
  );
}

export function ProviderCard({
  meta,
  configured,
  enabled,
  apiKey,
  capabilities,
  models,
  fixed,
  testState = 'idle',
  extra,
  onToggle,
  onTest,
  onModels,
  onEdit,
  onDelete,
  onAdd,
  onRemoveModel,
}: ProviderCardProps) {
  const caps = capabilities ?? (configured ? ['language'] : []);
  const showAddState = !fixed && !configured && onAdd;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-100">{meta.label}</p>
            {configured && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 size={9} /> Configured
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{meta.description}</p>
        </div>
        {fixed && onToggle && (
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500" />
          </label>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 flex-1">
        {/* Capability pills + key row (only when configured or addable) */}
        {!showAddState && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {ALL_CAPABILITIES.map((c) => (
                <CapabilityPill key={c.id} cap={c} active={caps.includes(c.id)} />
              ))}
            </div>
            {meta.supportsKey && <MaskedKey present={!!apiKey} />}
          </div>
        )}

        {/* Selected models — removable blue pills */}
        {configured && (models?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {models!.map((m) => (
              <span
                key={m}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30"
              >
                {m}
                {onRemoveModel && (
                  <button
                    type="button"
                    onClick={() => onRemoveModel(m)}
                    className="p-0.5 rounded-full hover:bg-blue-500/20 transition-colors"
                    title={`Remove ${m}`}
                  >
                    <Plus size={10} className="rotate-45" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {extra}

        {showAddState && (
          <p className="text-[11px] text-slate-500">
            No configuration yet. Add your {meta.label} API key to enable this provider.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-end gap-1.5 bg-slate-900/40">
        {showAddState ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <Plus size={13} /> Add Configuration
          </button>
        ) : (
          <>
            {!fixed && onTest && (
              <button
                type="button"
                onClick={onTest}
                title="Test connection"
                className={`p-1.5 rounded-md transition-colors border ${
                  testState === 'ok'
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                    : testState === 'fail'
                      ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                      : 'text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Zap size={13} />
              </button>
            )}
            {!fixed && onModels && (
              <button
                type="button"
                onClick={onModels}
                title="Manage models"
                className="p-1.5 rounded-md text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <Boxes size={13} />
              </button>
            )}
            {!fixed && onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md text-slate-300 border border-slate-800 hover:bg-slate-800 transition-colors"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
            {!fixed && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                title="Delete configuration"
                className="p-1.5 rounded-md text-slate-400 border border-slate-800 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
