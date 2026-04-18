import React, { useState } from "react"
import { Sparkles, ChevronDown, ChevronUp, Settings2, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Suggestion } from "../types"
import { insertIntoActiveTab } from "../lib/insertIntoActiveTab"

interface SuggestionPanelProps {
  suggestion: Suggestion
}

export function SuggestionPanel({ suggestion }: SuggestionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isApplied, setIsApplied] = useState(false)

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (suggestion.suggestedText) {
      await insertIntoActiveTab(suggestion.suggestedText)
    }
    setIsApplied(true)
    setTimeout(() => setIsApplied(false), 2000)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div
        className="p-3 flex items-start justify-between cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex gap-3 items-start">
          <div className="mt-0.5 p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <Sparkles size={14} />
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-200">{suggestion.title}</h4>
            <p className="text-xs text-slate-400 mt-0.5">{suggestion.description}</p>
            {suggestion.rule && (
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-500">
                {suggestion.rule.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <button className="p-1 hover:text-slate-300 hover:bg-slate-800 rounded" onClick={(e) => e.stopPropagation()}>
            <Settings2 size={14} />
          </button>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{
              height: 0,
              opacity: 0,
            }}
            animate={{
              height: "auto",
              opacity: 1,
            }}
            exit={{
              height: 0,
              opacity: 0,
            }}
            className="border-t border-slate-800 bg-slate-900/50"
          >
            <div className="p-3 space-y-3">
              {suggestion.originalText && suggestion.suggestedText && (
                <div className="space-y-2">
                  <div className="text-xs">
                    <span className="text-slate-500 font-medium">Original:</span>
                    <div className="mt-1 p-2 bg-slate-950 rounded border border-slate-800 text-slate-400 line-through decoration-slate-600">
                      {suggestion.originalText}
                    </div>
                  </div>
                  <div className="text-xs">
                    <span className="text-indigo-400 font-medium">Suggested:</span>
                    <div className="mt-1 p-2 bg-indigo-950/30 rounded border border-indigo-500/30 text-slate-300">
                      {suggestion.suggestedText}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleApply}
                className={`w-full py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all ${isApplied ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500"}`}
              >
                {isApplied ? (
                  <>
                    <Check size={14} /> Applied
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> {suggestion.actionText}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
