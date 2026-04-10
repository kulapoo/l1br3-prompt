import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Link,
  Bookmark,
  Globe,
  AlertTriangle,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { SuggestionPanel } from './SuggestionPanel';
import { useAppConfig } from '../contexts/AppConfig';
import { fetchSuggestions } from '../lib/api';
import { useDebounce } from '../hooks/useDebounce';
import type { Suggestion, SuggestContext } from '../types';

export function SuggestionsTab() {
  const { config } = useAppConfig();
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState<Omit<SuggestContext, 'inputText'>>({});
  const [useAi, setUseAi] = useState(false);

  const debouncedInput = useDebounce(input, 500);
  const backendConnected = config.backend.isInstalled;

  const runSuggestions = useCallback(async (ctx: SuggestContext) => {
    if (!backendConnected) return;
    const hasContext = ctx.url || ctx.inputText || ctx.selectedText || ctx.pageTitle;
    if (!hasContext) {
      setSuggestions([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const results = await fetchSuggestions(
        config.backend.url,
        { ...ctx, useAi },
        { deviceId: config.ai.deviceId, cloudEnabled: config.ai.cloudEnabled },
      );
      setSuggestions(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch suggestions');
    } finally {
      setIsLoading(false);
    }
  }, [backendConnected, config.backend.url, useAi]);

  // Auto-fetch on debounced input change
  useEffect(() => {
    runSuggestions({ ...pageContext, inputText: debouncedInput || undefined });
  }, [debouncedInput, pageContext, runSuggestions]);

  // Re-fetch when user switches tabs
  useEffect(() => {
    const handler = (message: { type: string }) => {
      if (message.type === 'TAB_CHANGED') {
        setPageContext({});
        setSuggestions([]);
      }
    };
    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, []);

  const handleCurrentPage = async () => {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const ctx = await browser.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' }) as Omit<SuggestContext, 'inputText'>;
      setPageContext(ctx);
      if (ctx.selectedText) setInput(ctx.selectedText);
    } catch {
      // Content script not available on this page — use tab URL/title fallback
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab) setPageContext({ url: tab.url, pageTitle: tab.title });
    }
  };

  const handleRefresh = () => {
    runSuggestions({ ...pageContext, inputText: input || undefined });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-200">Enhance</h2>
          <div className="flex items-center gap-2">
            {config.ai.availableModels.length > 0 && (
              <button
                onClick={() => setUseAi(!useAi)}
                title={useAi ? 'AI re-ranking on' : 'AI re-ranking off'}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border ${
                  useAi
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
              >
                <Sparkles size={10} /> AI
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="text-slate-400 hover:text-indigo-400 transition-colors p-1 rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {!backendConnected && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-500">Backend Not Connected</p>
              <p className="text-[10px] text-amber-500/80 mt-1">
                Start the local backend and enable it in Settings to get suggestions.
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Input</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste text, URL, or code snippet to analyze..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none h-24"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.readText().then((text) => setInput(text)).catch(() => {});
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-[10px] font-medium text-slate-300 transition-colors"
            >
              <Link size={12} /> Paste URL
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-[10px] font-medium text-slate-300 transition-colors">
              <Bookmark size={12} /> From Saved
            </button>
            <button
              onClick={handleCurrentPage}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-[10px] font-medium text-slate-300 transition-colors"
            >
              <Globe size={12} /> Current Page
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={!backendConnected || isLoading}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles size={14} />
            {isLoading ? 'Analyzing...' : 'Run Suggestions'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {suggestions.length > 0 ? `${suggestions.length} Suggestion${suggestions.length !== 1 ? 's' : ''}` : 'Active Suggestions'}
            </h3>
            <button className="text-slate-500 hover:text-slate-300 transition-colors">
              <Settings2 size={14} />
            </button>
          </div>

          {suggestions.length === 0 && !isLoading && (
            <p className="text-xs text-slate-600 text-center py-8">
              {backendConnected
                ? 'Add context above or visit a page to get suggestions.'
                : 'Connect the backend in Settings to enable suggestions.'}
            </p>
          )}

          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="relative group">
              <SuggestionPanel suggestion={suggestion} />
              <div className="absolute top-3 right-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-7 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
