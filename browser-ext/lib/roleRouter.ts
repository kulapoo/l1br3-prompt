import type { AiProviderConfig, ByokRequestConfig, ModelAssignment, ModelRole } from "../types"

export interface ResolvedRoleProvider {
  /** BYOK wire config, or undefined to let the backend fall through to local Ollama. */
  byok: ByokRequestConfig | undefined
  /** Model id to pass through; null when neither assignment nor fallback supplies one. */
  model: string | null
}

export interface ResolveRoleProviderOptions {
  /** Model id used when no usable assignment exists (typically the local Ollama selection). */
  fallbackModel: string | null
}

/**
 * Resolve a purpose-specific Default Model Assignment into the BYOK wire shape
 * the backend already accepts (M1 contract). Pure function — no side effects,
 * safe to call from any component or test.
 *
 * Resolution rules (OQ#2 fallback policy):
 *   1. No assignment for the role           → Ollama fallback (no byok).
 *   2. Assignment points at `'ollama'`       → Ollama, using the assigned model.
 *   3. Assignment points at a BYOK provider that is missing, disabled, or has
 *      no/empty apiKey                        → Ollama fallback + console warning.
 *   4. Otherwise                              → emit `{ type, apiKey, baseUrl, model }`.
 */
export function resolveRoleProvider(
  role: ModelRole,
  providers: AiProviderConfig[],
  assignments: Record<ModelRole, ModelAssignment | null>,
  opts: ResolveRoleProviderOptions,
): ResolvedRoleProvider {
  const assignment = assignments[role]

  if (!assignment) {
    return { byok: undefined, model: opts.fallbackModel }
  }

  if (assignment.providerId === "ollama") {
    return { byok: undefined, model: assignment.model }
  }

  const provider = providers.find((p) => p.id === assignment.providerId)
  if (!provider || !provider.enabled || !provider.apiKey || provider.type === "ollama") {
    console.warn(
      `[roleRouter] assignment for "${role}" points at provider "${assignment.providerId}" ` +
        "which is missing, disabled, or has no API key; falling back to local Ollama.",
    )
    return { byok: undefined, model: opts.fallbackModel }
  }

  return {
    byok: {
      type: provider.type,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      model: assignment.model,
    },
    model: assignment.model,
  }
}
