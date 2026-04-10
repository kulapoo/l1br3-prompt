import React, { useState, useEffect } from 'react';
import { fetchAiStatus } from '../lib/api';
import {
  Cloud,
  Database,
  Cpu,
  HardDrive,
  Download,
  Upload,
  Trash2,
  ShieldCheck,
  Server,
  Info,
  Lock,
  SlidersHorizontal,
  Sparkles,
  Plus,
  Globe,
  Zap,
  Terminal,
  HardDriveIcon,
  Pencil,
  X,
  Save } from
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

export function SettingsTab() {
  const { config, updateConfig } = useAppConfig();
  const [editingAction, setEditingAction] = useState<QuickAction | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch available Ollama models whenever the backend becomes connected
  useEffect(() => {
    if (!config.backend.isInstalled) return;
    fetchAiStatus(config.backend.url)
      .then((status) => {
        updateConfig({
          ai: {
            ...config.ai,
            availableModels: status.ollama.models,
            selectedModel:
              config.ai.selectedModel && status.ollama.models.includes(config.ai.selectedModel)
                ? config.ai.selectedModel
                : status.ollama.models[0] ?? null,
          },
        });
      })
      .catch(() => {
        // Ollama not running — clear model list but don't surface an error
        updateConfig({ ai: { ...config.ai, availableModels: [], selectedModel: null } });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.backend.isInstalled, config.backend.url]);

  const handleToggleBackend = () => {
    updateConfig({
      backend: {
        ...config.backend,
        isInstalled: !config.backend.isInstalled
      },
      // Auto-disconnect AI and Sync if backend is uninstalled
      ai: !config.backend.isInstalled ?
      config.ai :
      {
        ...config.ai,
        localConnected: false,
        cloudEnabled: false
      },
      sync: !config.backend.isInstalled ?
      config.sync :
      {
        ...config.sync,
        enabled: false
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
        <h2 className="text-sm font-medium text-slate-200">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
        {/* Backend Connection */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Server size={14} /> Backend Connection
          </h3>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-2 w-2 rounded-full ${config.backend.isInstalled ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                  </span>
                  <span
                    className={`text-xs font-medium ${config.backend.isInstalled ? 'text-emerald-500' : 'text-rose-500'}`}>

                    {config.backend.isInstalled ? 'Connected' : 'Not Found'}
                  </span>
                </div>
                <button
                  onClick={handleToggleBackend}
                  className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors">

                  {config.backend.isInstalled ?
                  'Disconnect' :
                  'Simulate Install'}
                </button>
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

                <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-md transition-colors">
                  Test
                </button>
              </div>
            </div>
            <div className="p-3 bg-slate-900/50 flex items-start gap-2">
              <Info size={14} className="text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                The local backend enables AI suggestions, cloud sync, and
                advanced template processing. Install it from the releases page.
              </p>
            </div>
          </div>
        </section>

        {/* AI Connection */}
        <section className="space-y-3 relative">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Cpu size={14} /> AI Connection
          </h3>

          {!config.backend.isInstalled &&
          <div className="absolute inset-0 z-10 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl mt-6">
              <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
                <Lock size={12} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-300">
                  Requires Backend
                </span>
              </div>
            </div>
          }

          <div
            className={`space-y-3 ${!config.backend.isInstalled ? 'opacity-40 pointer-events-none' : ''}`}>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Local AI (Ollama)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Free, unlimited, private
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config.ai.localConnected}
                    onChange={(e) =>
                    updateConfig({
                      ai: {
                        ...config.ai,
                        localConnected: e.target.checked
                      }
                    })
                    } />

                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
              <div className="p-3 bg-slate-900/50">
                <label className="block text-xs text-slate-500 mb-1.5">
                  Active Model
                </label>
                {config.ai.availableModels.length > 0 ? (
                  <select
                    value={config.ai.selectedModel ?? ''}
                    onChange={(e) =>
                      updateConfig({ ai: { ...config.ai, selectedModel: e.target.value } })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
                  >
                    {config.ai.availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-amber-500/80">
                    No models found.{' '}
                    <span className="underline cursor-pointer" onClick={() =>
                      window.open('https://ollama.com', '_blank')
                    }>
                      Install Ollama
                    </span>{' '}
                    and run <code className="font-mono">ollama pull llama3:8b</code>.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Cloud AI Fallback
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Groq / Gemini ({config.ai.cloudQuotaRemaining} req/day left)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={config.ai.cloudEnabled}
                    onChange={(e) =>
                    updateConfig({
                      ai: {
                        ...config.ai,
                        cloudEnabled: e.target.checked
                      }
                    })
                    } />

                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Sync & Backup */}
        <section className="space-y-3 relative">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Cloud size={14} /> Cloud Sync
          </h3>

          {!config.backend.isInstalled &&
          <div className="absolute inset-0 z-10 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center rounded-xl mt-6">
              <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
                <Lock size={12} className="text-slate-400" />
                <span className="text-[10px] font-medium text-slate-300">
                  Requires Backend
                </span>
              </div>
            </div>
          }

          <div
            className={`bg-slate-900 border border-slate-800 rounded-xl p-3 ${!config.backend.isInstalled ? 'opacity-40 pointer-events-none' : ''}`}>

            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Supabase Sync
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Backup and cross-device
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.sync.enabled}
                  onChange={(e) =>
                  updateConfig({
                    sync: {
                      ...config.sync,
                      enabled: e.target.checked
                    }
                  })
                  } />

                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {config.sync.enabled && !config.sync.isAuthenticated &&
            <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-800">
                <button
                onClick={() =>
                updateConfig({
                  sync: {
                    ...config.sync,
                    isAuthenticated: true,
                    lastSyncTime: 'Just now'
                  }
                })
                }
                className="w-full flex items-center justify-center gap-2 py-2 bg-white text-slate-900 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">

                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />

                    <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />

                    <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />

                    <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />

                  </svg>
                  Sign in with Google
                </button>
              </div>
            }

            {config.sync.enabled && config.sync.isAuthenticated &&
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="text-[10px] text-slate-400">
                  Last sync: {config.sync.lastSyncTime || 'Never'}
                </div>
                <button className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300">
                  Sync Now
                </button>
              </div>
            }

            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
              <ShieldCheck size={12} /> E2E Encryption available
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
                <div>
                      <label className="block text-[10px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                        API Endpoint URL
                      </label>
                      <input
                    type="text"
                    value={(editingAction.source as {type: 'api'; url: string}).url || ''}
                    onChange={(e) =>
                    setEditingAction({
                      ...editingAction,
                      source: {
                        type: 'api',
                        url: e.target.value
                      }
                    })
                    }
                    placeholder="https://api.example.com/enhance"
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 font-mono" />

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
