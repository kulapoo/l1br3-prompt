import React from 'react';
import { Server, Zap, ZapOff } from 'lucide-react';
import { useAppConfig } from '../contexts/AppConfig';

export function StatusBar() {
  const { config } = useAppConfig();
  return <div
    className="h-8 border-t border-slate-800 bg-slate-950 flex items-center justify-between px-3 text-[10px] text-slate-500 shrink-0 cursor-pointer hover:bg-slate-900 transition-colors"
    title="Click to open settings">

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5" title="Local Backend Status">
          <span className="relative flex h-1.5 w-1.5">
            {config.backend.isInstalled &&
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          }
            <span
            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.backend.isInstalled ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          </span>
          </span>
          <Server size={10} />{' '}
          {config.backend.isInstalled ? 'Local' : 'Offline'}
        </div>
      </div>

      <div
      className={`flex items-center gap-1.5 ${
        config.ai.activeProvider === 'ollama'
          ? 'text-indigo-400'
          : config.ai.localConnected
            ? 'text-indigo-400'
            : 'text-slate-500'
      }`}
      title={
        config.ai.activeProvider === 'ollama'
          ? 'Using local Ollama'
          : config.ai.localConnected
            ? 'Ollama ready'
            : 'No AI provider available'
      }>
        {config.ai.localConnected ? <Zap size={10} /> : <ZapOff size={10} />}
        {config.ai.activeProvider === 'ollama'
          ? 'Ollama'
          : config.ai.localConnected
            ? 'Ollama Ready'
            : 'AI Offline'}
      </div>
    </div>;

}
