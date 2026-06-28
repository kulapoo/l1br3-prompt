import React, { useMemo, useState } from 'react';
import { Cpu, Plus } from 'lucide-react';
import { useAppConfig } from '../../contexts/AppConfig';
import type { AiProviderConfig, ModelAssignment, ModelRole, ProviderType } from '../../types';
import * as api from '../../lib/api';
import { PROVIDER_META, PROVIDER_ORDER } from './providerMeta';
import { DefaultModelAssignments } from './DefaultModelAssignments';
import { ProviderCard, type TestState } from './ProviderCard';
import { ProviderEditModal, type ProviderSavePayload } from './ProviderEditModal';

export function ModelsManager() {
  const { config, updateAi } = useAppConfig();
  const { ai } = config;

  const [editing, setEditing] = useState<
    { mode: 'create' | 'edit'; type?: ProviderType; config?: AiProviderConfig } | null
  >(null);
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});

  const providers = ai.providers;
  const assignments = ai.assignments;

  const byType = useMemo(() => {
    const map = new Map<ProviderType, AiProviderConfig>();
    for (const p of providers) map.set(p.type, p);
    return map;
  }, [providers]);

  // ── Assignment helpers ───────────────────────────────────────────────────
  const setAssignment = (role: ModelRole, assignment: ModelAssignment | null) => {
    updateAi({ assignments: { ...assignments, [role]: assignment } });
  };

  const autoAssign = () => {
    const next = { ...assignments };
    const pick = (role: ModelRole) => {
      if (next[role]) return;
      if (ai.availableModels.length > 0) {
        next[role] = { providerId: 'ollama', model: ai.availableModels[0] };
        return;
      }
      for (const p of providers) {
        if (p.enabled && p.models.length > 0) {
          next[role] = { providerId: p.id, model: p.models[0] };
          return;
        }
      }
    };
    pick('chat');
    pick('transform');
    updateAi({ assignments: next });
  };

  // ── Provider CRUD ────────────────────────────────────────────────────────
  // M3: the plaintext key is POSTed to the backend here and never stored
  // locally. The returned `serverProviderId` + `hasKey` are persisted instead.
  const saveProvider = async (payload: ProviderSavePayload) => {
    const { config: cfg, apiKey } = payload;
    const backendUrl = config.backend.url;
    try {
      let serverProviderId = cfg.serverProviderId;
      let hasKey = cfg.hasKey;
      if (apiKey) {
        if (cfg.serverProviderId) {
          // Rotate existing key.
          const updated = await api.updateProvider(backendUrl, cfg.serverProviderId, {
            baseUrl: cfg.baseUrl,
            apiKey,
          });
          serverProviderId = updated.id;
          hasKey = updated.hasKey;
        } else {
          // Create new server-side key record.
          const created = await api.createProvider(backendUrl, {
            type: cfg.type as "openai" | "openai_compatible",
            baseUrl: cfg.baseUrl,
            apiKey,
          });
          serverProviderId = created.id;
          hasKey = created.hasKey;
        }
      }
      const persisted: AiProviderConfig = { ...cfg, serverProviderId, hasKey };
      const exists = providers.some((p) => p.id === persisted.id);
      const next = exists
        ? providers.map((p) => (p.id === persisted.id ? persisted : p))
        : [...providers, persisted];
      updateAi({ providers: next });
      setEditing(null);
    } catch (err) {
      console.error('[ModelsManager] failed to save provider', err);
      // Surface the error to the modal by leaving it open; a production UI would
      // show a toast. Keep the modal editable so the user can retry.
    }
  };

  const deleteProvider = async (cfg: AiProviderConfig) => {
    // Best-effort server-side delete; local cleanup happens regardless.
    if (cfg.serverProviderId) {
      try {
        await api.deleteProvider(config.backend.url, cfg.serverProviderId);
      } catch (err) {
        console.error('[ModelsManager] server-side provider delete failed', err);
      }
    }
    const next = providers.filter((p) => p.id !== cfg.id);
    // Clear any assignments that pointed at the deleted provider.
    const cleared = { ...assignments };
    (Object.keys(cleared) as ModelRole[]).forEach((role) => {
      if (cleared[role]?.providerId === cfg.id) cleared[role] = null;
    });
    updateAi({ providers: next, assignments: cleared });
  };

  const removeProviderModel = (cfg: AiProviderConfig, model: string) => {
    const next = providers.map((p) =>
      p.id === cfg.id ? { ...p, models: p.models.filter((m) => m !== model) } : p,
    );
    const cleared = { ...assignments };
    (Object.keys(cleared) as ModelRole[]).forEach((role) => {
      if (cleared[role]?.providerId === cfg.id && cleared[role]?.model === model) {
        cleared[role] = null;
      }
    });
    updateAi({ providers: next, assignments: cleared });
  };

  const runTest = (cfg: AiProviderConfig) => {
    setTestStates((s) => ({ ...s, [cfg.id]: 'testing' }));
    // M3: the plaintext key lives server-side, so a client-side key-prefix
    // check is no longer possible. Treat presence of a stored server key as the
    // configured signal; a real upstream health check will arrive with the
    // /ai/status provider-count enrichment.
    setTimeout(() => {
      const ok = !!cfg.serverProviderId && (cfg.hasKey ?? false);
      setTestStates((s) => ({ ...s, [cfg.id]: ok ? 'ok' : 'fail' }));
    }, 350);
  };

  // ── Ollama hint ───────────────────────────────────────────────────────────
  const ollamaExtra =
    ai.availableModels.length === 0 ? (
      <p className="text-[11px] text-amber-500/80">
        No models found. Install{' '}
        <span
          className="underline cursor-pointer"
          onClick={() => window.open('https://ollama.com', '_blank')}
        >
          Ollama
        </span>{' '}
        and run <code className="font-mono">ollama pull llama3:8b</code>.
      </p>
    ) : undefined;

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Page header */}
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-400">
            <Cpu size={16} />
            <span className="text-[11px] font-semibold uppercase tracking-wider">AI Models</span>
          </div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Configure your AI with your own API keys
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Store API keys to enable AI providers in l1br3-prompt. Keys are encrypted at rest on
            the local backend and never leave your machine in plaintext.
          </p>
        </header>

        {/* Section 1 — Default Model Assignments */}
        <DefaultModelAssignments
          assignments={assignments}
          providers={providers}
          ollamaModels={ai.availableModels}
          onChange={setAssignment}
          onAutoAssign={autoAssign}
        />

        {/* Section 2 — Provider Configuration */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Provider Configuration</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Add API keys for the providers you want to use. Local Ollama is included automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PROVIDER_ORDER.map((type) => {
              const meta = PROVIDER_META[type];

              // Fixed provider (ollama)
              if (meta.fixed) {
                return (
                  <ProviderCard
                    key={type}
                    meta={meta}
                    configured={ai.localConnected}
                    enabled={ai.localConnected}
                    models={ai.availableModels}
                    capabilities={['language']}
                    fixed
                    extra={ollamaExtra}
                    onToggle={(v) => updateAi({ localConnected: v })}
                  />
                );
              }

              // BYOK providers
              const cfg = byType.get(type);
              if (!cfg) {
                return (
                  <ProviderCard
                    key={type}
                    meta={meta}
                    configured={false}
                    enabled={false}
                    onAdd={() => setEditing({ mode: 'create', type })}
                  />
                );
              }
              return (
                <ProviderCard
                  key={type}
                  meta={meta}
                  configured={cfg.configured}
                  enabled={cfg.enabled}
                  hasKey={cfg.hasKey ?? false}
                  capabilities={cfg.capabilities}
                  models={cfg.models}
                  testState={testStates[cfg.id] ?? 'idle'}
                  onTest={() => runTest(cfg)}
                  onModels={() => setEditing({ mode: 'edit', config: cfg })}
                  onEdit={() => setEditing({ mode: 'edit', config: cfg })}
                  onDelete={() => deleteProvider(cfg)}
                  onRemoveModel={(m) => removeProviderModel(cfg, m)}
                />
              );
            })}
          </div>

          {/* Secondary add button (for adding another OpenAI-Compatible endpoint) */}
          {!byType.get('openai_compatible') && (
            <button
              type="button"
              onClick={() => setEditing({ mode: 'create', type: 'openai_compatible' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-slate-400 hover:text-slate-200 border border-dashed border-slate-800 hover:border-slate-700 transition-colors"
            >
              <Plus size={13} /> Add another OpenAI-Compatible endpoint
            </button>
          )}
        </section>
      </div>

      {editing && (
        <ProviderEditModal
          mode={editing.mode}
          initial={editing.config}
          onSave={saveProvider}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
