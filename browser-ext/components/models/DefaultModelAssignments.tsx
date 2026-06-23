import React from 'react';
import { AlertTriangle, Sparkles, Wand2 } from 'lucide-react';
import type { AiProviderConfig, ModelAssignment, ModelRole } from '../../types';

export interface DefaultModelAssignmentsProps {
  assignments: Record<ModelRole, ModelAssignment | null>;
  providers: AiProviderConfig[];
  ollamaModels: string[];
  cloudEnabled: boolean;
  onChange: (role: ModelRole, assignment: ModelAssignment | null) => void;
  onAutoAssign: () => void;
}

interface ModelOption {
  providerId: string;
  providerLabel: string;
  model: string;
}

function buildOptions(
  providers: AiProviderConfig[],
  ollamaModels: string[],
  cloudEnabled: boolean,
): ModelOption[] {
  const opts: ModelOption[] = [];
  for (const m of ollamaModels) opts.push({ providerId: 'ollama', providerLabel: 'Ollama', model: m });
  if (cloudEnabled) opts.push({ providerId: 'cloud', providerLabel: 'Free Cloud', model: 'cloud-default' });
  for (const p of providers) {
    if (!p.enabled) continue;
    for (const m of p.models) opts.push({ providerId: p.id, providerLabel: p.label, model: m });
  }
  return opts;
}

function optionValue(a: ModelAssignment): string {
  return `${a.providerId}::${a.model}`;
}

function parseValue(value: string): ModelAssignment | null {
  if (!value) return null;
  const idx = value.indexOf('::');
  if (idx === -1) return null;
  return { providerId: value.slice(0, idx), model: value.slice(idx + 2) };
}

function RoleRow({
  label,
  required,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: ModelAssignment | null;
  options: ModelOption[];
  onChange: (a: ModelAssignment | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200">
          {label} {required && <span className="text-rose-400">*</span>}
          {!required && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-slate-600">optional</span>}
        </p>
        {hint && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="shrink-0 w-72">
        <select
          value={value ? optionValue(value) : ''}
          onChange={(e) => onChange(parseValue(e.target.value))}
          className="w-full bg-slate-950 border border-slate-800 rounded-md px-2.5 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
        >
          <option value="">Select a model</option>
          {options.map((o) => (
            <option key={`${o.providerId}::${o.model}`} value={optionValue(o)}>
              {o.model} — {o.providerLabel}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function DefaultModelAssignments({
  assignments,
  providers,
  ollamaModels,
  cloudEnabled,
  onChange,
  onAutoAssign,
}: DefaultModelAssignmentsProps) {
  const options = buildOptions(providers, ollamaModels, cloudEnabled);

  const missing: string[] = [];
  if (!assignments.chat) missing.push('Chat Model');
  if (!assignments.transform) missing.push('Transformation Model');

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Default Model Assignments</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure which models to use for different purposes across l1br3-prompt.
          </p>
        </div>
        <button
          type="button"
          onClick={onAutoAssign}
          disabled={options.length === 0}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700 transition-colors"
        >
          <Wand2 size={13} /> Auto-assign Defaults
        </button>
      </div>

      {missing.length > 0 && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-200">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-400" />
          <p className="text-xs leading-relaxed">
            Missing required model{missing.length > 1 ? 's' : ''}:{' '}
            <span className="font-semibold">{missing.join(', ')}</span>. l1br3-prompt may not
            function properly without {missing.length > 1 ? 'these' : 'this'}.
          </p>
        </div>
      )}

      {/* Primary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Primary</p>
        </div>
        <div className="divide-y divide-slate-800">
          <RoleRow
            label="Chat Model"
            required
            hint="Used for prompt generation in Compose."
            value={assignments.chat}
            options={options}
            onChange={(a) => onChange('chat', a)}
          />
        </div>
      </div>

      {/* Advanced */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60 flex items-center gap-1.5">
          <Sparkles size={12} className="text-slate-500" />
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Advanced</p>
        </div>
        <div className="divide-y divide-slate-800">
          <RoleRow
            label="Transformation Model"
            required
            hint="Used for summaries, insights, and transformations (Enhance)."
            value={assignments.transform}
            options={options}
            onChange={(a) => onChange('transform', a)}
          />
        </div>
      </div>
    </section>
  );
}
