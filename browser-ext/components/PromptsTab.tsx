import React, { useState } from 'react';
import { Search, Plus, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PromptCard } from './PromptCard';
import { MOCK_PROMPTS, MOCK_TAGS } from '../data/mockData';
import { useAppConfig } from '../contexts/AppConfig';

export function PromptsTab() {
  const { config } = useAppConfig();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [prompts, setPrompts] = useState(MOCK_PROMPTS);

  const handleCopy = (_id: string) => {
    // Copy prompt — will be wired to content script insertion in a future phase
  };

  const handleToggleFavorite = (id: string) => {
    setPrompts(
      prompts.map((p) =>
      p.id === id ?
      {
        ...p,
        isFavorite: !p.isFavorite
      } :
      p
      )
    );
  };

  const filteredPrompts = prompts.filter((p) => {
    const matchesSearch =
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
    activeFilter === 'all' ||
    activeFilter === 'favorites' && p.isFavorite ||
    p.tags.some((t) => t.id === activeFilter);
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md">
        {!config.backend.isInstalled &&
        <div className="mb-3 p-2 bg-slate-900 border border-slate-800 rounded-lg flex items-start gap-2">
            <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Some features require the backend. Prompts are stored locally.
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
            onClick={() => setActiveFilter('all')}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeFilter === 'all' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>

            All
          </button>
          <button
            onClick={() => setActiveFilter('favorites')}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeFilter === 'favorites' ? 'bg-amber-400 text-amber-950' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>

            Favorites
          </button>
          <div className="w-px h-4 bg-slate-700 mx-1"></div>
          {MOCK_TAGS.map((tag) =>
          <button
            key={tag.id}
            onClick={() => setActiveFilter(tag.id)}
            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeFilter === tag.id ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>

              {tag.name}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence>
          {filteredPrompts.length > 0 ?
          filteredPrompts.map((prompt) =>
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            onCopy={handleCopy}
            onToggleFavorite={handleToggleFavorite} />

          ) :

          <motion.div
            initial={{
              opacity: 0
            }}
            animate={{
              opacity: 1
            }}
            className="flex flex-col items-center justify-center h-40 text-center">

              <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
                <Search className="text-slate-500" size={20} />
              </div>
              <p className="text-sm text-slate-400">No prompts found</p>
              <button className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <Plus size={12} /> Create new prompt
              </button>
            </motion.div>
          }
        </AnimatePresence>
      </div>
    </div>);

}
