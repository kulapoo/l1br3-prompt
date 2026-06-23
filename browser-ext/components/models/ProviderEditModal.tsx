import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Plus, ExternalLink } from 'lucide-react';
import type { AiProviderConfig, ProviderType, ProviderCapability } from '../../types';
import { ADDABLE_PROVIDER_TYPES, ALL_CAPABILITIES, PROVIDER_META } from './providerMeta';

export interface ProviderEditModalProps {
  mode: 'create' | 'edit';
  initial?: AiProviderConfig;
  onSave: (config: AiProviderConfig) => void;
  onClose: () => void;
}

function newId(): string {
  return `prov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ProviderEditModal({ mode, initial, onSave, onClose }: ProviderEditModalProps) {
  const [type, setType] = useState<ProviderType>(initial?.type ?? 'openai');
  const [label, setLabel] = useState(initial?.label ?? PROVIDER_META.openai.label);
  const [baseUrl, setBaseUrl] = useState<string | null>(initial?.baseUrl ?? PROVIDER_META.openai.defaultBaseUrl);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [capabilities, setCapabilities] = useState<ProviderCapability[]>(
    initial?.capabilities ?? ['language'],
  );
  const [models, setModels] = useState<string[]>(initial?.models ?? []);
  const [modelInput, setModelInput] = useState('');

  // When the type changes during create, refresh the type-derived defaults.
  const onTypeChange = (t: ProviderType) => {
    const meta = PROVIDER_META[t];
    setType(t);
    if (mode === 'create') {
      setLabel(meta.label);
      setBaseUrl(meta.defaultBaseUrl);
    }
  };

  const toggleCap = (cap: ProviderCapability) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  const addModel = () => {
    const m = modelInput.trim();
    if (!m || models.includes(m)) return;
    setModels([...models, m]);
    setModelInput('');
  };

  const removeModel = (m: string) => setModels((prev) => prev.filter((x) => x !== m));

  const meta = PROVIDER_META[type];
  const canSave = label.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const config: AiProviderConfig = {
      id: initial?.id ?? newId(),
      type,
      label: label.trim(),
      baseUrl: (baseUrl ?? '').trim() || null,
      apiKey: apiKey.trim() || null,
      enabled: initial?.enabled ?? true,
      capabilities,
      models,
      configured: !!apiKey.trim() || !meta.supportsKey,
    };
    onSave(config);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            {mode === 'create' ? 'Add Provider' : `Edit ${initial?.label ?? 'Provider'}`}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Provider type (create only) */}
          {mode === 'create' && (
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Provider
              </label>
              <div className="grid grid-cols-1 gap-2">
                {ADDABLE_PROVIDER_TYPES.map((t) => {
                  const m = PROVIDER_META[t];
                  const isActive = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onTypeChange(t)}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg text-left border transition-all ${
                        isActive
                          ? 'bg-indigo-500/10 border-indigo-500/40'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${isActive ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {m.label}
                        </p>
                        <p className="text-[11px] text-slate-500 leading-snug">{m.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Label */}
          <div>
            <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. OpenAI, My local Llama"
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
            />
          </div>

          {/* Base URL */}
          {meta.defaultBaseUrl !== null && (
            <div>
              <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl ?? ''}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={meta.defaultBaseUrl}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 font-mono"
              />
            </div>
          )}

          {/* API Key */}
          {meta.supportsKey && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  API Key <span className="text-rose-400">*</span>
                </label>
                {meta.docsUrl && (
                  <a
                    href={meta.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                  >
                    Get a key <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta.keyPlaceholder}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 font-mono"
              />
              <p className="mt-1.5 text-[10px] text-slate-500 leading-relaxed">
                Stored locally in your browser for now. Encrypted server-side key storage arrives
                with the backend integration.
              </p>
            </div>
          )}

          {/* Capabilities */}
          <div>
            <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Capabilities
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CAPABILITIES.map((c) => {
                const active = capabilities.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCap(c.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      active
                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                        : 'bg-slate-950 text-slate-500 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Models */}
          <div>
            <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Available Models
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addModel();
                  }
                }}
                placeholder="model id, e.g. gpt-4o"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 placeholder:text-slate-600 font-mono"
              />
              <button
                type="button"
                onClick={addModel}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1"
              >
                <Plus size={13} /> Add
              </button>
            </div>
            {meta.defaultModels.length > 0 && models.length === 0 && (
              <button
                type="button"
                onClick={() => setModels([...meta.defaultModels])}
                className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300"
              >
                Insert {meta.label} defaults ({meta.defaultModels.length})
              </button>
            )}
            {models.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {models.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30"
                  >
                    {m}
                    <button
                      type="button"
                      onClick={() => removeModel(m)}
                      className="p-0.5 rounded-full hover:bg-blue-500/20 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
            <Save size={14} /> {mode === 'create' ? 'Add Provider' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
