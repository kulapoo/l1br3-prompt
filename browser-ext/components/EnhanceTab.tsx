import React, { useState, useRef, useEffect } from 'react';
import {
  Wand2,
  Bookmark,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useAppConfig } from '../contexts/AppConfig';
import { streamEnhance } from '../lib/api';
import { useCreatePrompt } from '../hooks/usePromptMutations';
import { usePrompts } from '../hooks/usePrompts';
import type { Prompt } from '../types';

type EnhanceMode =
  | 'summarize'
  | 'concise'
  | 'add_role'
  | 'chain_of_thought'
  | 'output_format'
  | 'best_judgement'
  | 'custom';

const CHIPS: { mode: Exclude<EnhanceMode, 'custom'>; label: string }[] = [
  { mode: 'summarize', label: 'Summarize' },
  { mode: 'concise', label: 'Make Concise' },
  { mode: 'add_role', label: 'Add Role' },
  { mode: 'chain_of_thought', label: 'Chain of Thought' },
  { mode: 'output_format', label: 'Specify Output Format' },
  { mode: 'best_judgement', label: 'Best Judgement' },
];

export function EnhanceTab() {
  const { config, setActiveTab, setEditingPrompt } = useAppConfig();
  const createPrompt = useCreatePrompt();

  const [input, setInput] = useState('');
  const [sourcePrompt, setSourcePrompt] = useState<Prompt | null>(null);
  const [mode, setMode] = useState<EnhanceMode | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [enhanced, setEnhanced] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<'ollama' | 'cloud' | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const aiAvailable =
    config.backend.isInstalled &&
    (config.ai.availableModels.length > 0 || config.ai.cloudEnabled);

  const canEnhance =
    aiAvailable && input.trim().length > 0 && mode !== null && !isStreaming;

  const handleEnhance = async () => {
    if (!canEnhance || mode === null) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setEnhanced('');
    setError(null);
    setProvider(null);
    setIsStreaming(true);

    try {
      await streamEnhance(
        config.backend.url,
        {
          prompt: input,
          mode,
          ...(mode === 'custom' && customInstruction ? { instruction: customInstruction } : {}),
        },
        (chunk) => setEnhanced((prev) => prev + chunk),
        ctrl.signal,
        {
          deviceId: config.ai.deviceId,
          cloudEnabled: config.ai.cloudEnabled,
          onMeta: (m) => setProvider(m.provider),
        },
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Enhancement failed');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleUseThis = () => {
    const base: Prompt = sourcePrompt ?? {
      id: '',
      title: '',
      content: enhanced,
      tags: [],
      category: '',
      usageCount: 0,
      lastUsed: null,
      isFavorite: false,
    };
    setEditingPrompt({ ...base, content: enhanced });
    setActiveTab('compose');
  };

  const handleSaveAsNew = () => {
    setError(null);
    createPrompt.mutate(
      {
        title: sourcePrompt ? `${sourcePrompt.title} (enhanced)` : 'Enhanced prompt',
        content: enhanced,
        category: sourcePrompt?.category,
        tags: sourcePrompt?.tags?.map((t) => ({ name: t.name })),
      },
      {
        // Only navigate once the prompt is actually persisted — otherwise the
        // user is whisked to Prompts believing a failed save succeeded.
        onSuccess: () => setActiveTab('prompts'),
        onError: (err: Error) => setError(err.message || 'Failed to save prompt'),
      },
    );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(enhanced).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const showResult = enhanced.length > 0 || isStreaming;

  const chipClass = (active: boolean) =>
    `px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
      active
        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
    }`;

  return (
    <div className="flex flex-col h-full relative">
      {showPicker && (
        <FromSavedPicker
          onSelect={(prompt) => {
            setInput(prompt.content);
            setSourcePrompt(prompt);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-200">Enhance</h2>
          {provider && (
            <span className="text-[10px] text-slate-500">
              via {provider === 'ollama' ? 'Ollama' : 'Cloud AI'}
            </span>
          )}
        </div>

        {!aiAvailable && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-500">AI Not Available</p>
              <p className="text-[10px] text-amber-500/80 mt-1">
                Start the local backend with Ollama, or enable Cloud AI in Settings.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Prompt</label>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setSourcePrompt(null);
              }}
              placeholder="Type a prompt or load one from your library..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none h-24"
            />
          </div>

          <button
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-[10px] font-medium text-slate-300 transition-colors"
          >
            <Bookmark size={12} /> From Saved
          </button>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Enhancement mode
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map(({ mode: chipMode, label }) => (
                <button
                  key={chipMode}
                  onClick={() => setMode(mode === chipMode ? null : chipMode)}
                  className={chipClass(mode === chipMode)}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setMode(mode === 'custom' ? null : 'custom')}
                className={chipClass(mode === 'custom')}
              >
                Custom
              </button>
            </div>
          </div>

          {mode === 'custom' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Custom instruction
              </label>
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="Describe how to improve the prompt..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none h-16"
              />
            </div>
          )}

          <button
            onClick={handleEnhance}
            disabled={!canEnhance}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Wand2 size={14} />
            {isStreaming ? 'Enhancing...' : 'Enhance'}
          </button>
        </div>
      </div>

      {showResult && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Original
            </p>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed bg-slate-900/50 rounded-lg p-3 border border-slate-800/50">
              {input}
            </pre>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Enhanced
            </p>
            <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed bg-slate-900 rounded-lg p-3 border border-slate-700">
              {enhanced}
              {isStreaming && <span className="animate-pulse text-indigo-400">▋</span>}
            </pre>
          </div>

          {!isStreaming && enhanced && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleUseThis}
                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium rounded-md transition-colors"
              >
                Use this
              </button>
              <button
                onClick={handleSaveAsNew}
                className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium rounded-md transition-colors border border-slate-700"
              >
                Save as new
              </button>
              <button
                onClick={handleCopy}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-md transition-colors border border-slate-700"
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check size={12} className="text-emerald-400" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
              <button
                onClick={handleEnhance}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-md transition-colors border border-slate-700"
                title="Retry"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {!showResult && (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-slate-600 text-center">
            Enter a prompt, choose an enhancement mode, and click Enhance.
          </p>
        </div>
      )}
    </div>
  );
}

// ── FromSavedPicker ──────────────────────────────────────────────────────────

interface FromSavedPickerProps {
  onSelect: (prompt: Prompt) => void;
  onClose: () => void;
}

function FromSavedPicker({ onSelect, onClose }: FromSavedPickerProps) {
  const [query, setQuery] = useState('');
  const { prompts, isLoading, error, isFromCache } = usePrompts(query, null, null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-testid="from-saved-picker"
      className="absolute inset-0 z-30 flex flex-col bg-slate-950/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="p-4 border-b border-slate-800 flex items-center gap-2">
        <Search size={14} className="text-slate-500 shrink-0" />
        <input
          autoFocus
          type="text"
          placeholder="Search saved prompts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
        />
        <button
          onClick={onClose}
          className="p-1 text-slate-500 hover:text-slate-300 rounded-md hover:bg-slate-800 transition-colors"
          aria-label="Close picker"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isFromCache && (
          <p className="text-[10px] text-amber-400/80 text-center pb-2">
            Offline — showing cached prompts
          </p>
        )}
        {isLoading && (
          <p className="text-xs text-slate-500 text-center py-8">Loading prompts…</p>
        )}
        {error && (
          <p className="text-xs text-rose-400 text-center py-8">{error}</p>
        )}
        {!isLoading && !error && prompts.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-8">
            {query ? 'No prompts match your search.' : 'No saved prompts yet.'}
          </p>
        )}
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            onClick={() => onSelect(prompt)}
            className="w-full text-left bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-lg p-3 transition-colors"
          >
            <p className="text-xs font-medium text-slate-200 truncate">
              {prompt.title || '(untitled)'}
            </p>
            <p className="text-[10px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
              {prompt.content}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
