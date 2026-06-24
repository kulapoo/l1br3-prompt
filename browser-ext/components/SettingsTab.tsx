import React, { useState, useEffect } from 'react';
import { fetchAiStatus, pingBackend } from '../lib/api';
import {
  Database,
  Cpu,
  HardDrive,
  Download,
  Upload,
  Trash2,
  Server,
  Info,
  SlidersHorizontal,
  Sparkles,
  Plus,
  Globe,
  Zap,
  Terminal,
  HardDriveIcon,
  Pencil,
  X,
  Save,
  ExternalLink,
  LayoutDashboard } from
'lucide-react';
import {
  useAppConfig,
  QuickAction,
  QuickActionSource } from
'../contexts/AppConfig';
import { AnimatePresence, motion } from 'framer-motion';

const COLOR_OPTIONS = [
{
  id: 'text-emerald-400',
  label: 'Green',
  dot: 'bg-emerald-400'
},
{
  id: 'text-amber-400',
  label: 'Amber',
  dot: 'bg-amber-400'
},
{
  id: 'text-blue-400',
  label: 'Blue',
  dot: 'bg-blue-400'
},
{
  id: 'text-purple-400',
  label: 'Purple',
  dot: 'bg-purple-400'
},
{
  id: 'text-rose-400',
  label: 'Rose',
  dot: 'bg-rose-400'
},
{
  id: 'text-indigo-400',
  label: 'Indigo',
  dot: 'bg-indigo-400'
},
{
  id: 'text-cyan-400',
  label: 'Cyan',
  dot: 'bg-cyan-400'
}];

const SOURCE_TYPES = [
{
  type: 'local',
  label: 'Local (static text)',
  icon: HardDriveIcon
},
{
  type: 'api',
  label: 'REST API',
  icon: Globe
},
{
  type: 'ollama',
  label: 'Ollama (local AI)',
  icon: Zap
},
{
  type: 'mcp',
  label: 'MCP Tool',
  icon: Terminal
}] as
const;

function emptyAction(): QuickAction {
  return {
    id: `mod-${Date.now()}`,
    label: '',
    description: '',
    insertText: '',
    color: 'text-indigo-400',
    enabled: true,
    source: {
      type: 'local'
    }
  };
}

type BackendTestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok' }
  | { kind: 'fail' };

export function SettingsTab() {
  const { config, updateConfig, updateAi } = useAppConfig();
  const [editingAction, setEditingAction] = useState<QuickAction | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [backendTest, setBackendTest] = useState<BackendTestState>({ kind: 'idle' });

  const handleTestBackend = async () => {
    setBackendTest({ kind: 'testing' });
    const ok = await pingBackend(config.backend.url);
    setBackendTest({ kind: ok ? 'ok' : 'fail' });
    // Mirror the result into the live flag so the rest of the UI updates
    // immediately, without waiting for the next poll cycle.
    if (ok !== config.backend.isInstalled) {
      updateConfig({ backend: { ...config.backend, isInstalled: ok } });
    }
  };

  // Fetch AI status whenever backend connection changes.
  const refreshAiStatus = () => {
    if (!config.backend.isInstalled) return;
    fetchAiStatus(config.backend.url)
      .then((status) => {
        updateAi({
          availableModels: status.ollama.models,
          selectedModel:
            config.ai.selectedModel && status.ollama.models.includes(config.ai.selectedModel)
              ? config.ai.selectedModel
              : status.ollama.models[0] ?? null,
        });
      })
      .catch(() => {
        // AI not running — clear model list but don't surface an error
        updateAi({ availableModels: [], selectedModel: null });
      });
  };

  useEffect(() => {
    refreshAiStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.backend.isInstalled, config.backend.url]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
        <h2 className="text-sm font-medium text-slate-200">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
        {/* Workspace */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <LayoutDashboard size={14} /> Workspace
          </h3>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <button
              type="button"
              onClick={() => {
                browser.runtime.sendMessage({ type: 'OPEN_ADMIN' }).catch(() => {})
              }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-md transition-colors"
            >
              <span className="flex items-center gap-2">
                <LayoutDashboard size={14} /> Open Admin Mode
              </span>
              <ExternalLink size={12} className="text-slate-400" />
            </button>
            <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
              Opens the full-width workbench in a new tab. The sidebar stays available here.
            </p>
          </div>
        </section>

        {/* Backend Connection */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Server size={14} /> Backend Connection
          </h3>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`flex h-2 w-2 rounded-full ${config.backend.isInstalled ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                </span>
                <span
                  className={`text-xs font-medium ${config.backend.isInstalled ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {config.backend.isInstalled ? 'Connected' : 'Not Found'}
                </span>
                <span className="text-[10px] text-slate-500 ml-auto">
                  Auto-detected
                </span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.backend.url}
                  onChange={(e) =>
                  updateConfig({
                    backend: {
                      ...config.backend,
                      url: e.target.value
                    }
                  })
                  }
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500" />

                <button
                  onClick={handleTestBackend}
                  disabled={backendTest.kind === 'testing'}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed text-slate-300 text-xs font-medium rounded-md transition-colors">
                  {backendTest.kind === 'testing' ? 'Testing…' : 'Test'}
                </button>
              </div>

              {backendTest.kind === 'ok' && (
                <p className="mt-2 text-[10px] text-emerald-400">
                  ✓ Backend reachable at {config.backend.url}
                </p>
              )}
              {backendTest.kind === 'fail' && (
                <p className="mt-2 text-[10px] text-rose-400">
                  ✕ Could not reach {config.backend.url}. Is the backend running?
                </p>
              )}
            </div>
            <div className="p-3 bg-slate-900/50 flex items-start gap-2">
              <Info size={14} className="text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                The local backend enables AI suggestions and advanced template
                processing. Install it from the releases page — this panel will
                detect it automatically.
              </p>
            </div>
          </div>
        </section>

        {/* AI Models (compact summary — full manager is in Admin Mode) */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Cpu size={14} /> AI Models
          </h3>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {/* Default model summary */}
            <div className="p-3 border-b border-slate-800 space-y-2">
              {([
                ['Chat', config.ai.assignments.chat],
                ['Transformation', config.ai.assignments.transform],
              ] as const).map(([role, assignment]) => {
                const label = !assignment
                  ? null
                  : assignment.providerId === 'ollama'
                    ? `${assignment.model} · Ollama`
                    : `${assignment.model} · ${config.ai.providers.find((p) => p.id === assignment.providerId)?.label ?? 'Provider'}`;
                return (
                  <div key={role} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{role}</span>
                    <span className={`text-xs font-medium truncate ${label ? 'text-slate-200' : 'text-slate-600 italic'}`}>
                      {label ?? 'Not set'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Provider status pills */}
            <div className="px-3 py-2.5 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'Ollama', on: config.ai.localConnected },
                  ...config.ai.providers.map((p) => ({ label: p.label, on: p.configured })),
                ].map((p, i) => (
                  <span
                    key={`${p.label}-${i}`}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-slate-950 border-slate-800"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${p.on ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className={p.on ? 'text-slate-300' : 'text-slate-600'}>{p.label}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Manage models */}
            <div className="p-3">
              <button
                type="button"
                onClick={() => {
                  browser.runtime.sendMessage({ type: 'OPEN_ADMIN', target: 'models' }).catch(() => {});
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-md transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Cpu size={14} /> Manage models
                </span>
                <ExternalLink size={12} className="text-slate-400" />
              </button>
              <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
                Open the Models Manager in Admin Mode to add API keys (OpenAI, Anthropic, OpenAI
                Compatible) and assign default models.
              </p>
            </div>
          </div>
        </section>

        {/* Modifiers */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <SlidersHorizontal size={14} /> Modifiers
          </h3>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex items-start gap-2">
              <Info size={14} className="text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Modifiers are quick actions in the Compose editor. They can
                insert static text or connect to external sources like APIs,
                Ollama, or MCP tools.
              </p>
            </div>

            <div className="divide-y divide-slate-800">
              {config.quickActions.map((action) => {
                const sourceIcons: Record<
                  string,
                  {
                    icon: React.ElementType;
                    label: string;
                    color: string;
                  }> =
                {
                  local: {
                    icon: HardDriveIcon,
                    label: 'Local',
                    color: 'text-slate-400 bg-slate-800'
                  },
                  api: {
                    icon: Globe,
                    label: 'API',
                    color: 'text-blue-400 bg-blue-500/10'
                  },
                  mcp: {
                    icon: Terminal,
                    label: 'MCP',
                    color: 'text-purple-400 bg-purple-500/10'
                  },
                  ollama: {
                    icon: Zap,
                    label: 'Ollama',
                    color: 'text-amber-400 bg-amber-500/10'
                  }
                };
                const src =
                sourceIcons[action.source?.type || 'local'] ||
                sourceIcons.local;
                const SourceIcon = src.icon;
                return (
                  <div key={action.id} className="p-3 space-y-2 group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <Sparkles size={12} className={action.color} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-200 truncate">
                              {action.label}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full ${src.color}`}>

                              <SourceIcon size={9} /> {src.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">
                            {action.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <button
                          onClick={() => {
                            setEditingAction({
                              ...action
                            });
                            setIsCreating(false);
                          }}
                          className="p-1 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title="Edit">

                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => {
                            updateConfig({
                              quickActions: config.quickActions.filter(
                                (a) => a.id !== action.id
                              )
                            });
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete">

                          <Trash2 size={12} />
                        </button>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={action.enabled}
                            onChange={(e) => {
                              const updated = config.quickActions.map((a) =>
                              a.id === action.id ?
                              {
                                ...a,
                                enabled: e.target.checked
                              } :
                              a
                              );
                              updateConfig({
                                quickActions: updated
                              });
                            }} />

                          <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                        </label>
                      </div>
                    </div>
                    {action.source?.type === 'api' &&
                    <div className="ml-7 flex items-center gap-2">
                        <span className="text-[9px] text-slate-500">URL:</span>
                        <code className="text-[9px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono truncate">
                          {(action.source as {type: 'api'; url: string}).url}
                        </code>
                      </div>
                    }
                    {action.source?.type === 'ollama' &&
                    <div className="ml-7 flex items-center gap-2">
                        <span className="text-[9px] text-slate-500">
                          Prompt:
                        </span>
                        <code className="text-[9px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono truncate">
                          {(action.source as {type: 'ollama'; prompt: string}).prompt}
                        </code>
                      </div>
                    }
                    {action.source?.type === 'mcp' &&
                    <div className="ml-7 flex items-center gap-2">
                        <span className="text-[9px] text-slate-500">Tool:</span>
                        <code className="text-[9px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded font-mono truncate">
                          {(action.source as {type: 'mcp'; toolName: string}).toolName}
                        </code>
                      </div>
                    }
                  </div>);

              })}
            </div>

            <div className="p-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setEditingAction(emptyAction());
                  setIsCreating(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700">

                <Plus size={14} /> Add Modifier
              </button>
            </div>
          </div>

          {/* Modifier Form Modal */}
          <AnimatePresence>
            {editingAction &&
            <motion.div
              initial={{
                opacity: 0,
                y: 8
              }}
              animate={{
                opacity: 1,
                y: 0
              }}
              exit={{
                opacity: 0,
                y: 8
              }}
              className="bg-slate-900 border border-indigo-500/30 rounded-xl overflow-hidden shadow-lg shadow-indigo-500/5">

                <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                  <h4 className="text-xs font-semibold text-slate-200">
                    {isCreating ? 'New Modifier' : 'Edit Modifier'}
                  </h4>
                  <button
                  onClick={() => setEditingAction(null)}
                  className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors">

                    <X size={14} />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Label */}
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                      Label
                    </label>
                    <input
                    type="text"
                    value={editingAction.label}
                    onChange={(e) =>
                    setEditingAction({
                      ...editingAction,
                      label: e.target.value
                    })
                    }
                    placeholder="e.g., Make it Concise"
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600" />

                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                      Description
                    </label>
                    <input
                    type="text"
                    value={editingAction.description}
                    onChange={(e) =>
                    setEditingAction({
                      ...editingAction,
                      description: e.target.value
                    })
                    }
                    placeholder="Brief description of what this does"
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600" />

                  </div>

                  {/* Insert Text */}
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                      Insert Text
                    </label>
                    <textarea
                    value={editingAction.insertText}
                    onChange={(e) =>
                    setEditingAction({
                      ...editingAction,
                      insertText: e.target.value
                    })
                    }
                    placeholder="Text to insert into the prompt editor..."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 resize-none font-mono" />

                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      Color
                    </label>
                    <div className="flex gap-2">
                      {COLOR_OPTIONS.map((c) =>
                    <button
                      key={c.id}
                      onClick={() =>
                      setEditingAction({
                        ...editingAction,
                        color: c.id
                      })
                      }
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${editingAction.color === c.id ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-slate-900' : 'hover:ring-1 hover:ring-slate-600'}`}
                      title={c.label}>

                          <span
                        className={`w-4 h-4 rounded-full ${c.dot}`}>
                      </span>
                        </button>
                    )}
                    </div>
                  </div>

                  {/* Source Type */}
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                      Source
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {SOURCE_TYPES.map((st) => {
                      const StIcon = st.icon;
                      const isActive = editingAction.source?.type === st.type;
                      return (
                        <button
                          key={st.type}
                          onClick={() => {
                            let newSource: QuickActionSource;
                            switch (st.type) {
                              case 'api':
                                newSource = {
                                  type: 'api',
                                  url: ''
                                };
                                break;
                              case 'ollama':
                                newSource = {
                                  type: 'ollama',
                                  prompt: ''
                                };
                                break;
                              case 'mcp':
                                newSource = {
                                  type: 'mcp',
                                  toolName: ''
                                };
                                break;
                              default:
                                newSource = {
                                  type: 'local'
                                };
                            }
                            setEditingAction({
                              ...editingAction,
                              source: newSource
                            });
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${isActive ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/40' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'}`}>

                            <StIcon size={14} /> {st.label}
                          </button>);

                    })}
                    </div>
                  </div>

                  {/* Source-specific fields */}
                  {editingAction.source?.type === 'api' &&
                <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                          API Endpoint URL
                        </label>
                        <input
                      type="text"
                      value={(editingAction.source as {type: 'api'; url: string; method?: string}).url || ''}
                      onChange={(e) =>
                      setEditingAction({
                        ...editingAction,
                        source: {
                          ...(editingAction.source as {type: 'api'; url: string; method?: string}),
                          type: 'api',
                          url: e.target.value
                        }
                      })
                      }
                      placeholder="https://api.example.com/enhance"
                      className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 font-mono" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                          Method
                        </label>
                        <div className="flex gap-1">
                          {(['POST', 'GET'] as const).map((m) => {
                            const src = editingAction.source as {type: 'api'; url: string; method?: string};
                            const isActive = (src.method ?? 'POST') === m;
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setEditingAction({
                                  ...editingAction,
                                  source: { ...src, type: 'api', method: m }
                                })}
                                className={`px-3 py-1 rounded text-xs font-mono font-medium transition-all border ${isActive ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/40' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'}`}>
                                {m}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                }
                  {editingAction.source?.type === 'ollama' &&
                <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                        Ollama System Prompt
                      </label>
                      <textarea
                    value={(editingAction.source as {type: 'ollama'; prompt: string}).prompt || ''}
                    onChange={(e) =>
                    setEditingAction({
                      ...editingAction,
                      source: {
                        type: 'ollama',
                        prompt: e.target.value
                      }
                    })
                    }
                    placeholder="Improve the clarity and specificity of this prompt..."
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 resize-none" />

                    </div>
                }
                  {editingAction.source?.type === 'mcp' &&
                <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                        MCP Tool Name
                      </label>
                      <input
                    type="text"
                    value={(editingAction.source as {type: 'mcp'; toolName: string}).toolName || ''}
                    onChange={(e) =>
                    setEditingAction({
                      ...editingAction,
                      source: {
                        type: 'mcp',
                        toolName: e.target.value
                      }
                    })
                    }
                    placeholder="enhance_prompt"
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 font-mono" />

                    </div>
                }

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                    onClick={() => {
                      if (!editingAction.label.trim()) return;
                      if (isCreating) {
                        updateConfig({
                          quickActions: [
                          ...config.quickActions,
                          editingAction]

                        });
                      } else {
                        updateConfig({
                          quickActions: config.quickActions.map((a) =>
                          a.id === editingAction.id ? editingAction : a
                          )
                        });
                      }
                      setEditingAction(null);
                    }}
                    disabled={!editingAction.label.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors">

                      <Save size={14} />{' '}
                      {isCreating ? 'Create Modifier' : 'Save Changes'}
                    </button>
                    <button
                    onClick={() => setEditingAction(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700">

                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            }
          </AnimatePresence>
        </section>

        {/* Local Data */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Database size={14} /> Local Data
          </h3>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <HardDrive size={14} className="text-slate-500" /> Storage Used
              </div>
              <span className="text-xs font-medium text-slate-400">2.4 MB</span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800">
              <button className="p-3 flex flex-col items-center justify-center gap-1 hover:bg-slate-800/50 transition-colors">
                <Download size={16} className="text-indigo-400" />
                <span className="text-xs text-slate-300">Export JSON</span>
              </button>
              <button className="p-3 flex flex-col items-center justify-center gap-1 hover:bg-slate-800/50 transition-colors">
                <Upload size={16} className="text-slate-400" />
                <span className="text-xs text-slate-300">Import</span>
              </button>
            </div>

            <button className="w-full p-3 flex items-center justify-center gap-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors">
              <Trash2 size={14} /> Clear All Local Data
            </button>
          </div>
        </section>
      </div>
    </div>);

}
