import React, { useState } from 'react';
import { Copy, Star, Edit2, Trash2, Clock, Play, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Prompt } from '../types';

interface PromptCardProps {
  prompt: Prompt;
  onCopy: (id: string) => Promise<boolean>;
  onToggleFavorite: (prompt: Prompt) => void;
  onEdit: (prompt: Prompt) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export function PromptCard({
  prompt,
  onCopy,
  onToggleFavorite,
  onEdit,
  onDelete,
  disabled = false,
}: PromptCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group relative bg-slate-900 border border-slate-800 rounded-xl p-3 hover:border-indigo-500/50 transition-colors shadow-sm">

      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-slate-200 text-sm truncate pr-6">
          {prompt.title}
        </h3>
        <button
          onClick={() => onToggleFavorite(prompt)}
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
          {prompt.lastUsed && (
            <span className="flex items-center gap-1" title="Last used">
              <Clock size={10} /> {prompt.lastUsed}
            </span>
          )}
        </div>

        {confirmingDelete ? (
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-[10px] text-slate-400 mr-1">Delete?</span>
            <button
              onClick={() => { onDelete(prompt.id); setConfirmingDelete(false); }}
              className="px-2 py-1 text-[10px] font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-md transition-colors">
              Yes
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors">
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => !disabled && onEdit(prompt)}
              disabled={disabled}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={disabled ? 'Backend offline' : 'Edit'}>
              <Edit2 size={12} />
            </button>
            <button
              onClick={() => !disabled && setConfirmingDelete(true)}
              disabled={disabled}
              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={disabled ? 'Backend offline' : 'Delete'}>
              <Trash2 size={12} />
            </button>
            <button
              onClick={async () => {
                const ok = await onCopy(prompt.id);
                setCopyStatus(ok ? 'copied' : 'failed');
                setTimeout(() => setCopyStatus('idle'), 2000);
              }}
              className={`p-1.5 rounded-md transition-colors ml-1 ${copyStatus === 'copied' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : copyStatus === 'failed' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/20'}`}
              title={copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy Prompt'}>
              {copyStatus === 'copied' ? <Check size={14} /> : copyStatus === 'failed' ? <X size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
