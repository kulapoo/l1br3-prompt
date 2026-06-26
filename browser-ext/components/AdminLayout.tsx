import { useState } from "react"
import { BarChart3, Cpu, Database, Minimize2, Settings, TerminalSquare, X } from "lucide-react"
import { PromptsTab } from "./PromptsTab"
import { ComposeTab } from "./ComposeTab"
import { SettingsTab } from "./SettingsTab"
import { AnalyticsPanel } from "./AnalyticsPanel"
import { ModelsManager } from "./models/ModelsManager"
import { DatabaseManager } from "./databases/DatabaseManager"
import { AnimatePresence, motion } from "framer-motion"

async function closeAdminTab(): Promise<void> {
  try {
    const tab = await browser.tabs.getCurrent()
    if (tab?.id !== undefined) {
      await browser.tabs.remove(tab.id)
      return
    }
  } catch {
    // fall through
  }
  window.close()
}

type AdminView = "workbench" | "models" | "databases"

function initialView(): AdminView {
  try {
    const param = new URLSearchParams(window.location.search).get("view")
    if (param === "models") return "models"
    if (param === "databases") return "databases"
    return "workbench"
  } catch {
    return "workbench"
  }
}

export function AdminLayout() {
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<AdminView>(initialView)

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Top Navigation */}
      <div className="h-14 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20">
              <TerminalSquare size={18} className="text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-slate-100">
              l1br3-prompt{" "}
              <span className="text-xs font-normal text-slate-500 ml-2 px-2 py-0.5 bg-slate-900 rounded-full border border-slate-800">
                Admin Mode
              </span>
            </h1>
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-1 ml-2 bg-slate-900/80 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setView("workbench")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === "workbench" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Workbench
            </button>
            <button
              onClick={() => setView("models")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === "models" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Cpu size={13} /> Models
            </button>
            <button
              onClick={() => setView("databases")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                view === "databases" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Database size={13} /> Databases
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Settings size={16} /> Settings
          </button>
          <div className="w-px h-6 bg-slate-800" />
          <button
            onClick={closeAdminTab}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-sm font-medium text-slate-300 transition-colors"
          >
            <Minimize2 size={14} /> Sidebar Mode
          </button>
        </div>
      </div>

      {view === "models" ? (
        <div className="flex-1 overflow-hidden">
          <ModelsManager />
        </div>
      ) : view === "databases" ? (
        <div className="flex-1 overflow-hidden">
          <DatabaseManager />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Column: Prompts (320px fixed) */}
          <div className="w-[320px] border-r border-slate-800 flex flex-col bg-slate-950 shrink-0">
            <PromptsTab />
          </div>

          {/* Center Column: Compose (flex, fills remaining space) */}
          <div className="flex-1 flex flex-col bg-slate-900 min-w-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.2)]">
            <ComposeTab />
          </div>

          {/* Right Column: Analytics/Stats (380px fixed) */}
          <div className="w-[380px] border-l border-slate-800 flex flex-col bg-slate-950 shrink-0">
            <div className="flex border-b border-slate-800 shrink-0">
              <div className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 border-indigo-500 text-slate-100">
                <BarChart3 size={14} /> Stats
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AnalyticsPanel />
            </div>
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
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
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
      )}
    </div>
  )
}
