import type {
  AiStatus,
  ByokRequestConfig,
  DatabaseConnectionCreate,
  DatabaseConnectionRead,
  DatabaseConnectionUpdate,
  DbEngine,
  ConnectionTestResult,
  GenerateRequest,
  MasterKeyBundle,
  MasterKeyExportResult,
  MasterKeyImportResult,
  MasterKeyStatus,
  MigrationMeta,
  MigrationProgress,
  ProcessTemplateResponse,
  Prompt,
  PromptCreate,
  PromptStats,
  PromptUpdate,
  Tag,
  TransformMode,
} from "../types"

interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
  metadata?: { total: number; page: number; limit: number } | null
}

// ── Health ────────────────────────────────────────────────────────────────────

const PING_TIMEOUT_MS = 2000

/**
 * Probe the local backend's /health endpoint. Returns true iff the backend
 * responded with a successful envelope within PING_TIMEOUT_MS.
 *
 * Never throws — network failure, timeout, and bad responses all return false.
 * This is the negative result, not an exceptional case.
 */
export async function pingBackend(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      method: "GET",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    if (!res.ok) return false
    const json = (await res.json()) as ApiResponse<{ status?: string }>
    return json.success === true
  } catch {
    return false
  }
}

// ── SSE reader (shared by streamGenerate and streamTransform) ────────────────

async function _consumeSSE(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  opts?: {
    onMeta?: (meta: { provider: string }) => void
  },
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    // Keep the last potentially-incomplete line in the buffer
    buf = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      try {
        const data = JSON.parse(raw) as {
          chunk?: string
          done?: boolean
          error?: string
          meta?: { provider?: string }
        }
        if (data.error) throw new Error(data.error)
        if (data.done) return
        if (data.chunk) onChunk(data.chunk)
        if (data.meta?.provider && opts?.onMeta) {
          opts.onMeta({ provider: data.meta.provider })
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue // malformed frame — skip
        throw err
      }
    }
  }
}

// ── AI status ─────────────────────────────────────────────────────────────────

export async function fetchAiStatus(baseUrl: string): Promise<AiStatus> {
  const res = await fetch(`${baseUrl}/api/v1/ai/status`)
  if (!res.ok) throw new Error(`AI status request failed: ${res.statusText}`)
  const json: ApiResponse<AiStatus> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Unknown error")
  return json.data
}

// ── AI providers (encrypted server-side key storage) ─────────────────────────

export interface ServerProviderRead {
  id: string
  type: "openai" | "anthropic" | "openai_compatible"
  baseUrl: string | null
  hasKey: boolean
}

export async function listProviders(baseUrl: string): Promise<ServerProviderRead[]> {
  const res = await fetch(`${baseUrl}/api/v1/providers`)
  if (!res.ok) throw new Error(`Providers request failed: ${res.statusText}`)
  const json: ApiResponse<ServerProviderRead[]> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Unknown error from providers endpoint")
  return json.data ?? []
}

/**
 * Create a stored provider. The plaintext key is sent ONLY on this write call;
 * subsequent reads return just `hasKey`. Returns the server row including its
 * `id` (the `serverProviderId` the client persists locally).
 */
export async function createProvider(
  baseUrl: string,
  data: { type: ServerProviderRead["type"]; baseUrl?: string | null; apiKey: string },
): Promise<ServerProviderRead> {
  const res = await fetch(`${baseUrl}/api/v1/providers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok)
    throw new Error(`Create provider failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<ServerProviderRead> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Create provider error")
  return json.data
}

export async function updateProvider(
  baseUrl: string,
  id: string,
  data: { baseUrl?: string | null; apiKey?: string },
): Promise<ServerProviderRead> {
  const res = await fetch(`${baseUrl}/api/v1/providers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok)
    throw new Error(`Update provider failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<ServerProviderRead> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Update provider error")
  return json.data
}

export async function deleteProvider(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/providers/${id}`, { method: "DELETE" })
  if (!res.ok)
    throw new Error(`Delete provider failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<null> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Delete provider error")
}

// ── Database connections (M3) ─────────────────────────────────────────────────

export async function listDatabases(baseUrl: string): Promise<DatabaseConnectionRead[]> {
  const res = await fetch(`${baseUrl}/api/v1/databases`)
  if (!res.ok) throw new Error(`Databases request failed: ${res.statusText}`)
  const json: ApiResponse<DatabaseConnectionRead[]> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Unknown error from databases endpoint")
  return json.data ?? []
}

export async function createDatabase(baseUrl: string, data: DatabaseConnectionCreate): Promise<DatabaseConnectionRead> {
  const res = await fetch(`${baseUrl}/api/v1/databases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok)
    throw new Error(`Create database failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<DatabaseConnectionRead> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Create database error")
  return json.data
}

export async function updateDatabase(
  baseUrl: string,
  id: string,
  data: DatabaseConnectionUpdate,
): Promise<DatabaseConnectionRead> {
  const res = await fetch(`${baseUrl}/api/v1/databases/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok)
    throw new Error(`Update database failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<DatabaseConnectionRead> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Update database error")
  return json.data
}

export async function deleteDatabase(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/databases/${id}`, { method: "DELETE" })
  if (!res.ok)
    throw new Error(`Delete database failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<null> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Delete database error")
}

export async function testDatabase(
  baseUrl: string,
  data: { engine: DbEngine; url: string },
): Promise<ConnectionTestResult> {
  const res = await fetch(`${baseUrl}/api/v1/databases/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Database test failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<ConnectionTestResult> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Database test error")
  return json.data
}

export async function activateDatabase(baseUrl: string, id: string): Promise<DatabaseConnectionRead> {
  const res = await fetch(`${baseUrl}/api/v1/databases/${id}/activate`, {
    method: "POST",
  })
  if (!res.ok)
    throw new Error(`Activate database failed (${res.status}): ${await res.text().catch(() => res.statusText)}`)
  const json: ApiResponse<DatabaseConnectionRead> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Activate database error")
  return json.data
}

// ── Streaming migration (M4) ─────────────────────────────────────────────────
//
// Migrate has its own SSE vocabulary ({meta:{sourceEngine,…}}, {progress},
// {done}, {error}) distinct from /generate's ({meta:{provider}}, {chunk}). A
// focused consumer keeps the AI-streaming path (_consumeSSE) untouched.

async function _consumeMigrationSSE(
  body: ReadableStream<Uint8Array>,
  opts: {
    onMigrationMeta?: (meta: MigrationMeta) => void
    onProgress?: (progress: MigrationProgress) => void
  },
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      try {
        const data = JSON.parse(raw) as {
          done?: boolean
          error?: string
          meta?: MigrationMeta
          progress?: MigrationProgress
        }
        if (data.error) throw new Error(data.error)
        if (data.done) return
        if (data.meta && opts.onMigrationMeta) opts.onMigrationMeta(data.meta)
        if (data.progress && opts.onProgress) opts.onProgress(data.progress)
      } catch (err) {
        if (err instanceof SyntaxError) continue
        throw err
      }
    }
  }
}

/**
 * Stream the data copy from the active source to connection `id` via SSE.
 *
 * `onMigrationMeta` fires once at the start (dialect pair + copy plan);
 * `onProgress` fires per table-batch. Resolves on `{done}` (the target is now
 * active) or rejects on `{error}` / non-OK status (source stays active). Pass an
 * `AbortSignal` to cancel — the backend rolls the open copy transaction back.
 */
export async function migrateDatabase(
  baseUrl: string,
  id: string,
  opts: {
    onMigrationMeta?: (meta: MigrationMeta) => void
    onProgress?: (progress: MigrationProgress) => void
  },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/databases/${id}/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Migrate database failed (${res.status}): ${text}`)
  }
  if (!res.body) throw new Error("No response body from migrate endpoint")

  await _consumeMigrationSSE(res.body, opts)
}

// ── Streaming generate ────────────────────────────────────────────────────────
/**
 * Stream an AI-generated response via SSE.
 *
 * Calls onChunk for each text fragment and optionally onMeta when the server
 * reports which provider is serving the request. Returns when the stream is
 * done or the AbortSignal fires.
 */
export async function streamGenerate(
  baseUrl: string,
  request: GenerateRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  opts?: {
    onMeta?: (meta: { provider: string }) => void
  },
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  const res = await fetch(`${baseUrl}/api/v1/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Generate failed (${res.status}): ${text}`)
  }
  if (!res.body) throw new Error("No response body from generate endpoint")

  await _consumeSSE(res.body, onChunk, { onMeta: opts?.onMeta })
}

// ── Streaming transform ───────────────────────────────────────────────────────

/**
 * Stream an AI-transformed version of the prompt via SSE.
 *
 * `modes` is a list of transform-mode ids (built-in slugs and/or custom ids);
 * they are combined into a single meta-prompt on the server. The special id
 * "custom" uses the free-text `instruction`.
 */
export async function streamTransform(
  baseUrl: string,
  body: {
    prompt: string
    modes: string[]
    instruction?: string
    model?: string | null
    byok?: ByokRequestConfig | null
  },
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  opts?: {
    onMeta?: (meta: { provider: string }) => void
  },
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }

  const res = await fetch(`${baseUrl}/api/v1/transform`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Transform failed (${res.status}): ${text}`)
  }
  if (!res.body) throw new Error("No response body from transform endpoint")

  await _consumeSSE(res.body, onChunk, { onMeta: opts?.onMeta })
}

// ── Transform modes ──────────────────────────────────────────────────────────

export async function fetchTransformModes(baseUrl: string): Promise<TransformMode[]> {
  const res = await fetch(`${baseUrl}/api/v1/transform-modes`)
  if (!res.ok) throw new Error(`Transform modes request failed: ${res.statusText}`)
  const json: ApiResponse<TransformMode[]> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Unknown error from transform-modes endpoint")
  return json.data ?? []
}

export async function createTransformMode(
  baseUrl: string,
  data: { name: string; instruction: string },
): Promise<TransformMode> {
  const res = await fetch(`${baseUrl}/api/v1/transform-modes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Create transform mode failed: ${res.statusText}`)
  const json: ApiResponse<TransformMode> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Create transform mode error")
  return json.data
}

export async function deleteTransformMode(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/transform-modes/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error(`Delete transform mode failed: ${res.statusText}`)
  const json: ApiResponse<null> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Delete transform mode error")
}

// ── Prompts ───────────────────────────────────────────────────────────────────

export interface FetchPromptsParams {
  search?: string
  tag?: string
  category?: string
  favorite?: boolean
  page?: number
  limit?: number
}

export interface FetchPromptsResult {
  prompts: Prompt[]
  tags: Tag[]
  total: number
  page: number
  limit: number
}

export async function fetchPrompts(baseUrl: string, params?: FetchPromptsParams): Promise<FetchPromptsResult> {
  const url = new URL(`${baseUrl}/api/v1/prompts`)
  if (params?.search) url.searchParams.set("search", params.search)
  if (params?.tag) url.searchParams.set("tag", params.tag)
  if (params?.category) url.searchParams.set("category", params.category)
  if (params?.favorite !== undefined) url.searchParams.set("favorite", String(params.favorite))
  if (params?.page) url.searchParams.set("page", String(params.page))
  if (params?.limit) url.searchParams.set("limit", String(params.limit))

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Prompts request failed: ${res.statusText}`)
  const json: ApiResponse<Prompt[]> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Unknown error from prompts endpoint")

  const prompts = json.data ?? []
  const tagMap = new Map<string, Tag>()
  for (const p of prompts) {
    for (const t of p.tags) tagMap.set(t.id, t)
  }
  return {
    prompts,
    tags: Array.from(tagMap.values()),
    total: json.metadata?.total ?? prompts.length,
    page: json.metadata?.page ?? 1,
    limit: json.metadata?.limit ?? 20,
  }
}

export async function createPrompt(baseUrl: string, data: PromptCreate): Promise<Prompt> {
  const res = await fetch(`${baseUrl}/api/v1/prompts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Create prompt failed: ${res.statusText}`)
  const json: ApiResponse<Prompt> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Create prompt error")
  return json.data
}

export async function updatePrompt(baseUrl: string, id: string, data: PromptUpdate): Promise<Prompt> {
  const res = await fetch(`${baseUrl}/api/v1/prompts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Update prompt failed: ${res.statusText}`)
  const json: ApiResponse<Prompt> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Update prompt error")
  return json.data
}

export async function deletePrompt(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/prompts/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error(`Delete prompt failed: ${res.statusText}`)
  const json: ApiResponse<null> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Delete prompt error")
}

export async function recordCopy(baseUrl: string, id: string): Promise<Prompt> {
  const res = await fetch(`${baseUrl}/api/v1/prompts/${id}/copy`, { method: "POST" })
  if (!res.ok) throw new Error(`Record copy failed: ${res.statusText}`)
  const json: ApiResponse<Prompt> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Record copy error")
  return json.data
}

export async function fetchPromptStats(baseUrl: string): Promise<PromptStats> {
  const res = await fetch(`${baseUrl}/api/v1/prompts/stats`)
  if (!res.ok) throw new Error(`Stats request failed: ${res.statusText}`)
  const json: ApiResponse<PromptStats> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Stats endpoint error")
  return json.data
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchCategories(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/v1/categories`)
  if (!res.ok) throw new Error(`Categories request failed: ${res.statusText}`)
  const json: ApiResponse<string[]> = await res.json()
  if (!json.success) throw new Error(json.error ?? "Unknown error from categories endpoint")
  return json.data ?? []
}

// ── Modifier sources (api / mcp) ─────────────────────────────────────────────

const MODIFIER_TIMEOUT_MS = 30_000

export async function callApiSource(
  url: string,
  method: string,
  body: { content: string; variables: Record<string, string> },
): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MODIFIER_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`API source request failed (${res.status}): ${res.statusText}`)
  const json = (await res.json()) as ApiResponse<{ rendered: string }>
  if (!json.success || !json.data) throw new Error(json.error ?? "API source error")
  return json.data.rendered
}

export async function callMcpTool(baseUrl: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/mcp/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: toolName, args }),
    signal: AbortSignal.timeout(MODIFIER_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`MCP call failed (${res.status}): ${res.statusText}`)
  const json = (await res.json()) as ApiResponse<{ result: string }>
  if (!json.success || !json.data) throw new Error(json.error ?? "MCP tool error")
  return json.data.result
}

// ── Template processing ───────────────────────────────────────────────────────

export async function processTemplate(
  baseUrl: string,
  template: string,
  variables: Record<string, string>,
): Promise<ProcessTemplateResponse> {
  const res = await fetch(`${baseUrl}/api/v1/process-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template, variables }),
  })
  if (!res.ok) throw new Error(`Template processing failed: ${res.statusText}`)
  const json: ApiResponse<ProcessTemplateResponse> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? "Template error")
  return json.data
}

// ── Master-key portability (F19) ────────────────────────────────────────────

export async function getMasterKeyStatus(baseUrl: string): Promise<MasterKeyStatus> {
  const res = await fetch(`${baseUrl}/api/v1/security/master-key/status`, { method: "GET" })
  const json = (await res.json()) as ApiResponse<MasterKeyStatus>
  if (!json.success || !json.data) throw new Error(json.error ?? "Failed to read master-key status")
  return json.data
}

export async function exportMasterKey(baseUrl: string, passphrase: string): Promise<MasterKeyExportResult> {
  const res = await fetch(`${baseUrl}/api/v1/security/master-key/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  })
  const json = (await res.json()) as ApiResponse<MasterKeyExportResult>
  if (!json.success || !json.data) throw new Error(json.error ?? "Failed to export master key")
  return json.data
}

export async function importMasterKey(
  baseUrl: string,
  passphrase: string,
  bundle: MasterKeyBundle,
): Promise<MasterKeyImportResult> {
  const res = await fetch(`${baseUrl}/api/v1/security/master-key/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase, bundle }),
  })
  const json = (await res.json()) as ApiResponse<MasterKeyImportResult>
  if (!json.success || !json.data) throw new Error(json.error ?? "Failed to import master key")
  return json.data
}
