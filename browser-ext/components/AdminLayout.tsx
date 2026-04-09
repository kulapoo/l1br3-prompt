// AdminLayout — full-screen 3-column admin view
// TODO: Wire up to view routing when admin mode is implemented.
//       The reference project's App.tsx routed to this via AppConfig.viewMode === 'admin'.
//       In browser-ext, the sidepanel/main.tsx only renders Sidebar; add routing there when ready.

import { useState } from 'react'
import { Minimize2, Settings, TerminalSquare, X, FileText } from 'lucide-react'
import { useAppConfig } from '../contexts/AppConfig'
import { PromptsTab } from './PromptsTab'
import { ComposeTab } from './ComposeTab'
import { SuggestionsTab } from './SuggestionsTab'
import { SettingsTab } from './SettingsTab'
import { AnimatePresence, motion } from 'framer-motion'

export function AdminLayout() {
  const { updateConfig } = useAppConfig()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Top Navigation */}
      <div className="h-14 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
            <TerminalSquare size={18} className="text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-slate-100">
            l1br3-prompt{' '}
            <span className="text-xs font-normal text-slate-500 ml-2 px-2 py-0.5 bg-slate-900 rounded-full border border-slate-800">
              Admin Mode
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* TODO: Wire Docs button to docs view once view routing is added */}
          <button
            onClick={() => updateConfig({ viewMode: 'docs' })}
            className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <FileText size={16} /> Docs
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Settings size={16} /> Settings
          </button>
          <div className="w-px h-6 bg-slate-800" />
          {/* TODO: Wire Sidebar Mode button to sidebar view routing */}
          <button
            onClick={() => updateConfig({ viewMode: 'sidebar' })}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-sm font-medium text-slate-300 transition-colors"
          >
            <Minimize2 size={14} /> Sidebar Mode
          </button>
          {/* TODO: Replace with real user avatar / auth state */}
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-medium text-slate-400 cursor-pointer hover:bg-slate-700 transition-colors">
            U
          </div>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Prompts (320px fixed) */}
        <div className="w-[320px] border-r border-slate-800 flex flex-col bg-slate-950 shrink-0">
          <PromptsTab />
        </div>

        {/* Center Column: Compose (flex, fills remaining space) */}
        <div className="flex-1 flex flex-col bg-slate-900 min-w-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.2)]">
          <ComposeTab />
        </div>

        {/* Right Column: Suggestions (380px fixed) */}
        <div className="w-[380px] border-l border-slate-800 flex flex-col bg-slate-950 shrink-0">
          <SuggestionsTab />
        </div>

        {/* Settings Slide-over — backdrop + panel spring animation */}
        <AnimatePresence>
          {showSettings && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSettings(false)}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 right-0 bottom-0 w-[400px] bg-slate-950 border-l border-slate-800 shadow-2xl z-40 flex flex-col"
              >
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 backdrop-blur-md sticky top-0 z-10">
                  <h2 className="text-sm font-medium text-slate-200">Settings</h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <SettingsTab />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
