import React, { useState } from 'react';
import { Search, Plus, Info, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PromptCard } from './PromptCard';
import { usePrompts } from '../hooks/usePrompts';
import { usePromptMutations } from '../hooks/usePromptMutations';
import { useAppConfig } from '../contexts/AppConfig';
import { insertIntoActiveTab } from '../lib/insertIntoActiveTab';
import type { Prompt } from '../types';

export function PromptsTab() {
  const { config } = useAppConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const { prompts, tags, isLoading, error, refresh } = usePrompts(
    searchQuery,
    activeTagFilter,
    showFavoritesOnly ? true : null,
  );

  const { deleteMutation, toggleFavoriteMutation, recordCopyMutation } = usePromptMutations();

  const mutationError =
    deleteMutation.error?.message ??
    toggleFavoriteMutation.error?.message ??
    recordCopyMutation.error?.message ??
    null;

  const handleCopy = async (id: string): Promise<boolean> => {
    const prompt = prompts.find(p => p.id === id);
    if (!prompt) return false;
    try {
      await navigator.clipboard.writeText(prompt.content);
    } catch {
      return false;
    }
    await insertIntoActiveTab(prompt.content);
    if (config.backend.isInstalled) {
      recordCopyMutation.mutate(id);
    }
    return true;
  };

  const handleToggleFavorite = (prompt: Prompt) => {
    if (config.backend.isInstalled) {
      toggleFavoriteMutation.mutate(prompt);
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleEdit = (_prompt: Prompt) => {
    // TODO(F5): navigate to ComposeTab pre-filled with this prompt
  };

  const handleCreate = () => {
    // TODO(F5): navigate to ComposeTab for a new prompt
  };

  const clearMutationErrors = () => {
    deleteMutation.reset();
    toggleFavoriteMutation.reset();
    recordCopyMutation.reset();
  };

  const isAll = activeTagFilter === null && !showFavoritesOnly;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
        {!config.backend.isInstalled &&
          <div className="mb-3 p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-start gap-2">
            <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Backend not connected. Start the local backend to load your prompts.
            </p>
          </div>
        }
        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            size={14} />
          <input
            type="text"
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => { setActiveTagFilter(null); setShowFavoritesOnly(false); }}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${isAll ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            All
          </button>
          <button
            onClick={() => { setActiveTagFilter(null); setShowFavoritesOnly(!showFavoritesOnly); }}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${showFavoritesOnly ? 'bg-amber-400 text-amber-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            Favorites
          </button>
          {tags.length > 0 && <div className="w-px h-4 bg-slate-700 mx-1"></div>}
          {tags.map((tag) =>
            <button
              key={tag.id}
              onClick={() => setActiveTagFilter(activeTagFilter === tag.name ? null : tag.name)}
              className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeTagFilter === tag.name ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              {tag.name}
            </button>
          )}
        </div>
      </div>

      {mutationError && (
        <div className="mx-4 mt-3 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2">
          <span className="text-[10px] text-rose-400 flex-1">{mutationError}</span>
          <button
            onClick={clearMutationErrors}
            className="text-rose-500/60 hover:text-rose-400 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-2/3 mb-2"></div>
                <div className="h-3 bg-slate-800 rounded w-full mb-1"></div>
                <div className="h-3 bg-slate-800 rounded w-4/5"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-40 text-center">
            <p className="text-sm text-rose-400 mb-3">{error}</p>
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
              <RefreshCw size={12} /> Retry
            </button>
          </motion.div>
        ) : (
          <AnimatePresence>
            {prompts.length > 0 ?
              prompts.map((prompt) =>
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onCopy={handleCopy}
                  onToggleFavorite={handleToggleFavorite}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  disabled={!config.backend.isInstalled} />
              ) :
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-40 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
                  <Search className="text-slate-500" size={20} />
                </div>
                {config.backend.isInstalled ? (
                  <>
                    <p className="text-sm text-slate-400">No prompts yet</p>
                    <button
                      onClick={handleCreate}
                      className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                      <Plus size={12} /> Create one in the Compose tab
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Connect the backend to load prompts</p>
                )}
              </motion.div>
            }
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
