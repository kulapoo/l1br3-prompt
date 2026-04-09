import React from 'react';
import { Copy, Star, Edit2, Trash2, Clock, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { Prompt } from '../types';

interface PromptCardProps {
  prompt: Prompt;
  onCopy: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export function PromptCard({
  prompt,
  onCopy,
  onToggleFavorite
}: PromptCardProps) {
  return (
    <motion.div
      layout
      initial={{
        opacity: 0,
        y: 10
      }}
      animate={{
        opacity: 1,
        y: 0
      }}
      exit={{
        opacity: 0,
        scale: 0.95
      }}
      className="group relative bg-slate-900 border border-slate-800 rounded-xl p-3 hover:border-indigo-500/50 transition-colors shadow-sm">

      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-slate-200 text-sm truncate pr-6">
          {prompt.title}
        </h3>
        <button
          onClick={() => onToggleFavorite(prompt.id)}
          className="absolute top-3 right-3 text-slate-500 hover:text-amber-400 transition-colors">

          <Star
            size={14}
            className={prompt.isFavorite ? 'fill-amber-400 text-amber-400' : ''} />

        </button>
      </div>

      <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
        {prompt.content}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {prompt.tags.map((tag) =>
        <span
          key={tag.id}
          className={`text-[10px] px-1.5 py-0.5 rounded-md border ${tag.color}`}>

            {tag.name}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 mt-2">
        <div className="flex items-center text-[10px] text-slate-500 gap-3">
          <span className="flex items-center gap-1" title="Usage count">
            <Play size={10} /> {prompt.usageCount}
          </span>
          <span className="flex items-center gap-1" title="Last used">
            <Clock size={10} /> {prompt.lastUsed}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
            title="Edit">

            <Edit2 size={12} />
          </button>
          <button
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
            title="Delete">

            <Trash2 size={12} />
          </button>
          <button
            onClick={() => onCopy(prompt.id)}
            className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20 rounded-md transition-colors ml-1"
            title="Copy Prompt">

            <Copy size={14} />
          </button>
        </div>
      </div>
    </motion.div>);

}
