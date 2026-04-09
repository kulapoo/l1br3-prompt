import React, { useState } from 'react';
import {
  RefreshCw,
  Link,
  Bookmark,
  Globe,
  AlertTriangle,
  Lock,
  Settings2,
  Sparkles } from
'lucide-react';
import { SuggestionPanel } from './SuggestionPanel';
import { MOCK_SUGGESTIONS } from '../data/mockData';
import { useAppConfig } from '../contexts/AppConfig';

export function SuggestionsTab() {
  const { config, updateConfig } = useAppConfig();
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const aiConnected = config.ai.localConnected || config.ai.cloudEnabled;

  const handleRunSuggestions = () => {
    if (!aiConnected) return;
    setIsAnalyzing(true);
    setTimeout(() => setIsAnalyzing(false), 1500);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-200">Enhance</h2>
          <button className="text-slate-400 hover:text-indigo-400 transition-colors p-1 rounded-md hover:bg-slate-800">
            <RefreshCw
              size={14}
              className={isAnalyzing ? 'animate-spin' : ''} />

          </button>
        </div>

        {!aiConnected &&
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
            <AlertTriangle
            size={16}
            className="text-amber-500 shrink-0 mt-0.5" />

            <div>
              <p className="text-xs font-medium text-amber-500">
                AI Connection Required
              </p>
              <p className="text-[10px] text-amber-500/80 mt-1">
                Connect local or cloud AI in settings to enable suggestions.
              </p>
              <button
              onClick={() => {
                updateConfig({
                  ai: {
                    ...config.ai,
                    localConnected: true
                  }
                });
              }}
              className="text-[10px] font-medium text-amber-400 hover:text-amber-300 mt-2 underline underline-offset-2">

                Simulate Connection
              </button>
            </div>
          </div>
        }

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Input
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste text, URL, or code snippet to analyze..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none h-24" />

          </div>

          <div className="flex items-center gap-2">
            <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-[10px] font-medium text-slate-300 transition-colors">
              <Link size={12} /> Paste URL
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-[10px] font-medium text-slate-300 transition-colors">
              <Bookmark size={12} /> From Saved
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md text-[10px] font-medium text-slate-300 transition-colors">
              <Globe size={12} /> Current Page
            </button>
          </div>

          <button
            onClick={handleRunSuggestions}
            disabled={!aiConnected || !input}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            title={!aiConnected ? 'Connect AI in Settings first' : ''}>

            <Sparkles size={14} />{' '}
            {isAnalyzing ? 'Analyzing...' : 'Run Suggestions'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {!aiConnected &&
        <div className="absolute inset-0 z-10 bg-slate-950/50 backdrop-blur-[1px] flex flex-col items-center justify-center">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col items-center text-center max-w-[240px]">
              <Lock size={24} className="text-slate-500 mb-2" />
              <p className="text-sm font-medium text-slate-300">
                Suggestions Locked
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Configure AI connection to unlock intelligent prompt
                enhancements.
              </p>
            </div>
          </div>
        }

        <div
          className={`space-y-3 ${!aiConnected ? 'opacity-40 pointer-events-none' : ''}`}>

          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Active Suggestions
            </h3>
            <button className="text-slate-500 hover:text-slate-300 transition-colors">
              <Settings2 size={14} />
            </button>
          </div>

          {MOCK_SUGGESTIONS.map((suggestion) =>
          <div key={suggestion.id} className="relative group">
              <SuggestionPanel suggestion={suggestion} />
              <div className="absolute top-3 right-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                  type="checkbox"
                  className="sr-only peer"
                  defaultChecked />

                  <div className="w-7 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>);

}
