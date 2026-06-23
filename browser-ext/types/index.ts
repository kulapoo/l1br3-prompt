export type TabType = 'compose' | 'prompts' | 'settings';

export interface TransformMode {
  id: string;
  name: string;
  instruction: string;
  isBuiltin: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  tags: Tag[];
  category: string;
  usageCount: number;
  lastUsed: string | null;
  isFavorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptCreate {
  title: string;
  content: string;
  category?: string;
  isFavorite?: boolean;
  tags?: Array<{ name: string }>;
}

export type PromptUpdate = Partial<PromptCreate>;

export interface GenerateRequest {
  prompt: string;
  model?: string | null;
  options?: Record<string, unknown> | null;
  cloudEnabled?: boolean;
}

export interface ProcessTemplateResponse {
  rendered: string;
  variables: string[];
}

export interface PromptStatItem {
  id: string;
  title: string;
  usageCount: number;
  lastUsed: string | null;
}

export interface CategoryCount {
  category: string | null;
  count: number;
}

export interface PromptStats {
  totalPrompts: number;
  totalCopies: number;
  favoritesCount: number;
  topUsed: PromptStatItem[];
  stale: PromptStatItem[];
  byCategory: CategoryCount[];
}

export interface AiStatus {
  ollama: {
    reachable: boolean;
    models: string[];
  };
  cloud?: {
    reachable: boolean;
    quotaRemaining: number;
    quotaTotal: number;
    resetAt: string | null;
  };
  provider: 'ollama' | 'cloud' | null;
}

// ── AI Models Manager ────────────────────────────────────────────────────────

export type ProviderType = 'openai' | 'anthropic' | 'openai_compatible' | 'ollama' | 'cloud';
export type ProviderCapability = 'language' | 'embedding' | 'tts' | 'stt';
export type ModelRole = 'chat' | 'transform';

/**
 * A user-configured AI provider. BYOK providers (openai / anthropic /
 * openai_compatible) live in `AppConfig.ai.providers`. The fixed providers
 * (ollama / cloud) are derived from the existing connection flags and are
 * never stored in the providers array.
 *
 * NOTE: `apiKey` is held in browser.storage.local for now (same pattern as the
 * Supabase anon key). Encrypted backend key storage arrives in a follow-up.
 */
export interface AiProviderConfig {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string | null;
  apiKey: string | null;
  enabled: boolean;
  capabilities: ProviderCapability[];
  models: string[];
  configured: boolean;
}

export interface ModelAssignment {
  providerId: string;
  model: string;
}
