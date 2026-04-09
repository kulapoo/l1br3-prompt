import React from 'react';
import { Server, CloudOff, Cloud, Zap, ZapOff } from 'lucide-react';
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

        <div
        className={`flex items-center gap-1.5 ${config.sync.enabled && config.sync.isAuthenticated ? 'text-blue-400' : 'opacity-60'}`}
        title="Cloud Sync Status">

          {config.sync.enabled && config.sync.isAuthenticated ?
        <Cloud size={10} /> :

        <CloudOff size={10} />
        }
          {config.sync.enabled && config.sync.isAuthenticated ?
        'Synced' :
        'No Sync'}
        </div>
      </div>

      <div
      className={`flex items-center gap-1.5 ${config.ai.localConnected || config.ai.cloudEnabled ? 'text-indigo-400' : 'text-amber-500'}`}
      title="AI Status">

        {config.ai.localConnected || config.ai.cloudEnabled ?
      <Zap size={10} /> :

      <ZapOff size={10} />
      }
        {config.ai.localConnected ?
      'Ollama Ready' :
      config.ai.cloudEnabled ?
      'Cloud AI Ready' :
      'AI Offline'}
      </div>
    </div>;

}
