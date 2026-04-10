import React, { useCallback, useEffect, useRef, useState } from 'react';
import { streamGenerate, QuotaExceededError, processTemplate } from '../lib/api';
import { composePromptFor } from '../lib/compose';
import {
  Save,
  X,
  Tag,
  Code,
  Brackets,
  Type,
  Bold,
  Italic,
  List,
  Sparkles,
  Eye,
  Copy,
  Check,
  ChevronDown,
  Quote,
  ListOrdered,
  Minus,
  RefreshCw,
  SlidersHorizontal } from
'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppConfig } from '../contexts/AppConfig';

export function ComposeTab() {
  const { config, updateConfig } = useAppConfig();
  const [title, setTitle] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [detectedVars, setDetectedVars] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [preview, setPreview] = useState('');
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suggestRef = useRef<HTMLDivElement>(null);
  const enabledActions = config.quickActions.filter((a) => a.enabled);

  const editor = useEditor({
    extensions: [
    StarterKit.configure({
      codeBlock: {
        HTMLAttributes: {
          class: 'not-prose'
        }
      }
    }),
    Placeholder.configure({
      placeholder:
      'Start composing your prompt... Use the toolbar to format, or type {{variable}} for dynamic inputs.'
    })],

    content: '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none'
      }
    },
    onUpdate: ({ editor }) => {
      extractVariables(editor.getText());
    }
  });

  const extractVariables = useCallback((text: string) => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = Array.from(text.matchAll(regex)).map((m) => m[1].trim());
    const uniqueVars = [...new Set(matches)];
    setDetectedVars(uniqueVars);
    setVariables((prev) => {
      const newVars: Record<string, string> = {};
      uniqueVars.forEach((v) => {
        newVars[v] = prev[v] || '';
      });
      return newVars;
    });
  }, []);

  // Click outside to close suggest panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
      suggestRef.current &&
      !suggestRef.current.contains(e.target as Node))
      {
        setShowSuggestions(false);
      }
    };
    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSuggestions]);

  const handleInsertText = (text: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(text).run();
  };

  const handleWrapSelection = (before: string, after: string) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (selectedText) {
      editor.
      chain().
      focus().
      deleteSelection().
      insertContent(before + selectedText + after).
      run();
    } else {
      editor.
      chain().
      focus().
      insertContent(before + after).
      run();
    }
  };

  const generatePreview = useCallback(async () => {
    if (!editor) return '';
    const text = editor.getText();
    // Use backend template processing when the template has Jinja2 control structures
    if (config.backend.isInstalled && (text.includes('{%') || text.includes('{#'))) {
      try {
        const result = await processTemplate(config.backend.url, text, variables);
        return result.rendered;
      } catch {
        // Fall through to client-side substitution on error
      }
    }
    let preview = text;
    detectedVars.forEach((v) => {
      const value = variables[v];
      const regex = new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g');
      if (value) {
        preview = preview.replace(regex, value);
      }
    });
    return preview;
  }, [editor, detectedVars, variables, config.backend.isInstalled, config.backend.url]);

  // Keep the live preview in sync with the editor content and variables
  useEffect(() => {
    generatePreview().then(setPreview);
  }, [generatePreview]);

  const handleCopy = async () => {
    const preview = await generatePreview();
    if (!preview) return;
    navigator.clipboard.writeText(preview);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleModifierAction = async (action: (typeof config.quickActions)[0]) => {
    setShowSuggestions(false);

    if (action.source.type === 'ollama') {
      // Cancel any in-flight stream before starting a new one
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (isStreaming) {
        // Second click cancels the current stream
        setIsStreaming(false);
        return;
      }

      const model = config.ai.selectedModel;
      const cloudAvailable = config.ai.cloudEnabled && !!config.ai.deviceId;
      if ((!model && !cloudAvailable) || !config.backend.isInstalled) {
        handleInsertText(action.insertText); // Fallback: insert static text
        return;
      }

      const prompt = composePromptFor(action, editor?.getText() ?? '');
      abortRef.current = new AbortController();
      setIsStreaming(true);
      setQuotaError(null);
      try {
        await streamGenerate(
          config.backend.url,
          { prompt, model },
          (chunk) => {
            editor?.chain().focus().insertContent(chunk).run();
          },
          abortRef.current.signal,
          {
            deviceId: config.ai.deviceId,
            cloudEnabled: config.ai.cloudEnabled,
            onMeta: (meta) => {
              updateConfig({ ai: { ...config.ai, activeProvider: meta.provider } });
            },
          },
        );
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          const resetAt = err.resetAt
            ? new Date(err.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'tomorrow';
          setQuotaError(`Cloud quota exhausted, resets at ${resetAt}. Install Ollama for unlimited local AI.`);
        } else if (err instanceof Error && err.name !== 'AbortError') {
          // Non-cancel errors: insert static text as fallback
          handleInsertText(action.insertText);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
      return;
    }

    // 'local' source — insert static text
    // 'api' and 'mcp' sources are TODO for Phase 5/6
    handleInsertText(action.insertText);
  };

  const editorText = editor?.getText() || '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/50 sticky top-0 z-10 backdrop-blur-md flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-200">Compose</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!editorText}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${isCopied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'}`}>

            {isCopied ? <Check size={14} /> : <Copy size={14} />}
            {isCopied ? 'Copied!' : 'Copy'}
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-md transition-colors">
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      {quotaError && (
        <div className="mx-4 mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
          <span className="text-amber-400 text-[10px] leading-relaxed">{quotaError}</span>
          <button onClick={() => setQuotaError(null)} className="ml-auto text-amber-500/60 hover:text-amber-400 shrink-0">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-20">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Title (Optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Code Review Assistant"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />

        </div>

        {/* Editor */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Prompt Editor
          </label>
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-slate-800 bg-slate-950/50">
              {/* Formatting */}
              <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-800 mr-1.5">
                <button
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  className={`p-1.5 rounded-md transition-colors ${editor?.isActive('bold') ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  title="Bold">

                  <Bold size={14} />
                </button>
                <button
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  className={`p-1.5 rounded-md transition-colors ${editor?.isActive('italic') ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  title="Italic">

                  <Italic size={14} />
                </button>
                <button
                  onClick={() =>
                  editor?.
                  chain().
                  focus().
                  toggleHeading({
                    level: 2
                  }).
                  run()
                  }
                  className={`p-1.5 rounded-md transition-colors ${editor?.isActive('heading') ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  title="Heading">

                  <Type size={14} />
                </button>
              </div>

              {/* Structure */}
              <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-800 mr-1.5">
                <button
                  onClick={() =>
                  editor?.chain().focus().toggleBulletList().run()
                  }
                  className={`p-1.5 rounded-md transition-colors ${editor?.isActive('bulletList') ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  title="Bullet List">

                  <List size={14} />
                </button>
                <button
                  onClick={() =>
                  editor?.chain().focus().toggleOrderedList().run()
                  }
                  className={`p-1.5 rounded-md transition-colors ${editor?.isActive('orderedList') ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  title="Ordered List">

                  <ListOrdered size={14} />
                </button>
                <button
                  onClick={() =>
                  editor?.chain().focus().toggleBlockquote().run()
                  }
                  className={`p-1.5 rounded-md transition-colors ${editor?.isActive('blockquote') ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                  title="Quote">

                  <Quote size={14} />
                </button>
                <button
                  onClick={() =>
                  editor?.chain().focus().setHorizontalRule().run()
                  }
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
                  title="Divider">

                  <Minus size={14} />
                </button>
              </div>

              {/* Wrap */}
              <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-800 mr-1.5">
                <button
                  onClick={() =>
                  editor?.chain().focus().toggleCodeBlock().run()
                  }
                  className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${editor?.isActive('codeBlock') ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10'}`}
                  title="Code Block">

                  <Code size={14} />
                  <span className="text-[10px] font-medium">Code</span>
                </button>
                <button
                  onClick={() =>
                  handleWrapSelection('<context>\n', '\n</context>')
                  }
                  className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors flex items-center gap-1"
                  title="Wrap in XML">

                  <Brackets size={14} />
                  <span className="text-[10px] font-medium">XML</span>
                </button>
              </div>

              {/* Variable + Suggest */}
              <div className="flex items-center gap-1 flex-1 justify-end">
                <button
                  onClick={() => handleInsertText('{{new_variable}}')}
                  className="px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-md transition-colors border border-slate-800 hover:border-purple-500/30 flex items-center gap-1">

                  <Type size={10} /> Var
                </button>

                <div ref={suggestRef} className="relative">
                  <button
                    onClick={() => setShowSuggestions(!showSuggestions)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all text-[10px] font-medium border ${showSuggestions ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'}`}>

                    {isStreaming ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" /> Generating…
                      </>
                    ) : (
                      <>
                        <SlidersHorizontal size={12} /> Modifiers{' '}
                        <ChevronDown
                          size={10}
                          className={`transition-transform ${showSuggestions ? 'rotate-180' : ''}`} />
                      </>
                    )}
                  </button>

                  <AnimatePresence>
                    {showSuggestions &&
                    <motion.div
                      initial={{
                        opacity: 0,
                        y: -4,
                        scale: 0.98
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1
                      }}
                      exit={{
                        opacity: 0,
                        y: -4,
                        scale: 0.98
                      }}
                      transition={{
                        duration: 0.12
                      }}
                      className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 z-30 overflow-hidden">

                        <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/80">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Modifiers
                          </p>
                        </div>
                        <div className="py-1 max-h-64 overflow-y-auto">
                          {enabledActions.map((action) =>
                        <button
                          key={action.id}
                          onClick={() => handleModifierAction(action)}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-700/60 transition-colors group">

                              <div className="flex items-center gap-2">
                                <Sparkles size={12} className={action.color} />
                                <span className="text-xs font-medium text-slate-200 group-hover:text-white">
                                  {action.label}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5 ml-5 group-hover:text-slate-400">
                                {action.description}
                              </p>
                            </button>
                        )}
                        </div>
                      </motion.div>
                    }
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Tiptap Editor */}
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Dynamic Variables */}
        {detectedVars.length > 0 &&
        <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Type size={14} className="text-purple-400" />
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Template Variables
              </h3>
              <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">
                {detectedVars.length}
              </span>
            </div>
            <div className="space-y-2.5 bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
              {detectedVars.map((v) =>
            <div key={v}>
                  <label className="block text-[10px] text-slate-500 mb-1 font-mono uppercase tracking-wider">{`{{${v}}}`}</label>
                  <input
                type="text"
                value={variables[v] || ''}
                onChange={(e) =>
                setVariables({
                  ...variables,
                  [v]: e.target.value
                })
                }
                placeholder={`Enter value for ${v}...`}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600" />

                </div>
            )}
            </div>
          </div>
        }

        {/* Live Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-indigo-400" />
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Live Preview
              </h3>
            </div>
            <button
              onClick={handleCopy}
              disabled={!editorText}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${isCopied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'}`}>

              {isCopied ? <Check size={10} /> : <Copy size={10} />}
              {isCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="bg-slate-950 border-l-2 border-indigo-500 border-r border-t border-b border-r-slate-800 border-t-slate-800 border-b-slate-800 rounded-lg p-3 min-h-[80px]">
            {editorText ?
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {preview}
              </pre> :

            <span className="text-xs text-slate-600 italic">
                Start typing to see preview...
              </span>
            }
          </div>
        </div>

        {/* Tags */}
        <div className="space-y-3 pt-3 border-t border-slate-800/50">
          <label className="block text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Tag size={12} /> Tags
          </label>
          <div className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-800 rounded-lg">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md border bg-blue-500/20 text-blue-400 border-blue-500/30 flex items-center gap-1">
              Code{' '}
              <X size={10} className="cursor-pointer hover:text-blue-200" />
            </span>
            <input
              type="text"
              placeholder="Add tag..."
              className="bg-transparent border-none text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none flex-1 min-w-[60px]" />

          </div>
        </div>
      </div>
    </div>);

}
