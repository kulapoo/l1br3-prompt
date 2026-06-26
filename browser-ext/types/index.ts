export type TabType = "compose" | "prompts" | "settings"

export interface TransformMode {
  id: string
  name: string
  instruction: string
  isBuiltin: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Prompt {
  id: string
  title: string
  content: string
  tags: Tag[]
  category: string
  usageCount: number
  lastUsed: string | null
  isFavorite: boolean
  createdAt?: string
  updatedAt?: string
}

export interface PromptCreate {
  title: string
  content: string
  category?: string
  isFavorite?: boolean
  tags?: Array<{ name: string }>
}

export type PromptUpdate = Partial<PromptCreate>

export interface GenerateRequest {
  prompt: string
  model?: string | null
  options?: Record<string, unknown> | null
  byok?: ByokRequestConfig | null
}

export interface ProcessTemplateResponse {
  rendered: string
  variables: string[]
}

export interface PromptStatItem {
  id: string
  title: string
  usageCount: number
  lastUsed: string | null
}

export interface CategoryCount {
  category: string | null
  count: number
}

export interface PromptStats {
  totalPrompts: number
  totalCopies: number
  favoritesCount: number
  topUsed: PromptStatItem[]
  stale: PromptStatItem[]
  byCategory: CategoryCount[]
}

export interface AiStatus {
  ollama: {
    reachable: boolean
    models: string[]
  }
  provider: "ollama" | null
}

// ── AI Models Manager ────────────────────────────────────────────────────────

export type ProviderType = "openai" | "anthropic" | "openai_compatible" | "ollama"
export type ProviderCapability = "language" | "embedding" | "tts" | "stt"
export type ModelRole = "chat" | "transform"

/**
 * A user-configured AI provider. BYOK providers (openai / anthropic /
 * openai_compatible) live in `AppConfig.ai.providers`. The fixed Ollama provider
 * is derived from the existing connection flag and is never stored in the
 * providers array.
 *
 * M3: the API key is stored encrypted server-side and referenced by
 * `serverProviderId`. The plaintext key never persists in browser storage;
 * `hasKey` mirrors the server's `has_key` flag for display.
 */
export interface AiProviderConfig {
  id: string
  type: ProviderType
  label: string
  baseUrl: string | null
  /** Server-side ai_providers row id holding the encrypted key. */
  serverProviderId: string | null
  /** Mirrors the backend `has_key` flag for display; null when unkeyed. */
  hasKey: boolean | null
  enabled: boolean
  capabilities: ProviderCapability[]
  models: string[]
  configured: boolean
}

export interface ModelAssignment {
  providerId: string
  model: string
}

/**
 * BYOK provider config sent on a /generate or /transform request. Matches the
 * backend `ByokProviderConfig` (api/app/schemas/ai.py) field-for-field in
 * camelCase.
 *
 * M3 wire shape: the browser sends `providerId` referencing a stored,
 * encrypted ai_providers row; the backend decrypts in-process and the plaintext
 * key never travels over the wire.
 */
export interface ByokRequestConfig {
  providerId: string
  type?: Exclude<ProviderType, "ollama">
  baseUrl?: string | null
  model: string
}

// ── Database Manager (M3) ────────────────────────────────────────────────────

export type DbEngine = "sqlite" | "postgresql"

/**
 * A database connection as returned by the backend. The raw URL/password are
 * NEVER present — only `maskedUrl` (password replaced with ***) and
 * `hasPassword`. Mirrors the AI provider `hasKey`-only key signal.
 */
export interface DatabaseConnectionRead {
  id: string
  label: string
  engine: DbEngine
  hasPassword: boolean
  host: string | null
  port: number | null
  database: string | null
  maskedUrl: string
  isActive: boolean
  isDefault: boolean
}

export interface DatabaseConnectionCreate {
  label: string
  engine: DbEngine
  url: string
}

export interface DatabaseConnectionUpdate {
  label?: string
  url?: string
}

export interface ConnectionTestResult {
  ok: boolean
  error: string | null
}
