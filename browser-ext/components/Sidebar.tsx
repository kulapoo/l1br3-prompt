import React, { useState } from 'react';
import {
  Wand2,
  PenLine,
  Settings,
  TerminalSquare,
  AlertTriangle } from
'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PromptsTab } from './PromptsTab';
import { EnhanceTab } from './EnhanceTab';
import { ComposeTab } from './ComposeTab';
import { SettingsTab } from './SettingsTab';
import { StatusBar } from './StatusBar';
import { ConflictDialog } from './ConflictDialog';
import { useBackendHealth } from '../hooks/useBackendHealth';
import { useCloudQuota } from '../hooks/useCloudQuota';
import { useConflicts } from '../hooks/useConflicts';
import { useAppConfig } from '../contexts/AppConfig';

export function Sidebar() {
  // Live-detect the local backend so config.backend.isInstalled reflects
  // reality rather than a stored toggle.
  useBackendHealth();
  // Background quota polling for cloud AI fallback.
  useCloudQuota();
  const { activeTab, setActiveTab } = useAppConfig();
  const { count: conflictCount } = useConflicts();
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const tabs = [
  {
    id: 'compose',
    icon: PenLine,
    label: 'Compose'
  },
  {
    id: 'prompts',
    icon: TerminalSquare,
    label: 'Prompts'
  },
  {
    id: 'enhance',
    icon: Wand2,
    label: 'Enhance'
  },
  {
    id: 'settings',
    icon: Settings,
    label: 'Settings'
  }] as
  const;
  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200 shadow-2xl overflow-hidden border-r border-slate-800">
      {/* Header */}
      <div className="pt-4 px-4 pb-2 shrink-0 bg-slate-950 z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
              <TerminalSquare size={16} className="text-white" />
            </div>
            <h1 className="font-bold text-sm tracking-tight text-slate-100">
              l1br3-prompt
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {conflictCount > 0 && (
              <button
                onClick={() => setConflictDialogOpen(true)}
                title={`${conflictCount} sync conflict${conflictCount === 1 ? '' : 's'}`}
                aria-label={`${conflictCount} sync conflict${conflictCount === 1 ? '' : 's'}`}
                className="flex items-center gap-1 px-1.5 h-6 rounded-md bg-amber-950/60 border border-amber-700/60 text-amber-300 hover:bg-amber-900/60 transition-colors text-[10px] font-medium"
              >
                <AlertTriangle size={12} />
                {conflictCount}
              </button>
            )}
            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-medium text-slate-400 cursor-pointer hover:bg-slate-700 transition-colors">
              U
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-1 flex flex-col items-center justify-center py-1.5 rounded-md transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>

                {isActive &&
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-slate-800 rounded-md shadow-sm"
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 30
                  }} />

                }
                <div className="relative z-10 flex flex-col items-center gap-1">
                  <Icon size={14} />
                  <span className="text-[9px] font-medium uppercase tracking-wider">
                    {tab.label}
                  </span>
                </div>
              </button>);

          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative bg-slate-950">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{
              opacity: 0,
              y: 5
            }}
            animate={{
              opacity: 1,
              y: 0
            }}
            exit={{
              opacity: 0,
              y: -5
            }}
            transition={{
              duration: 0.15
            }}
            className="absolute inset-0 h-full w-full">

            {activeTab === 'compose' && <ComposeTab />}
            {activeTab === 'prompts' && <PromptsTab />}
            {activeTab === 'enhance' && <EnhanceTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Status Bar */}
      <StatusBar />

      <ConflictDialog
        open={conflictDialogOpen}
        onClose={() => setConflictDialogOpen(false)} />

    </div>);

}
