import type { AiStatus, GenerateRequest, ProcessTemplateResponse, Suggestion, SuggestContext } from '../types'

/** Thrown when the cloud provider returns a quota_exceeded error frame. */
export class QuotaExceededError extends Error {
  readonly resetAt: string | null
  constructor(resetAt: string | null) {
    super(`Cloud quota exhausted${resetAt ? `, resets at ${resetAt}` : ''}`)
    this.name = 'QuotaExceededError'
    this.resetAt = resetAt
  }
}

interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
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
      method: 'GET',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    if (!res.ok) return false
    const json = (await res.json()) as ApiResponse<{ status?: string }>
    return json.success === true
  } catch {
    return false
  }
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export async function fetchSuggestions(
  baseUrl: string,
  ctx: SuggestContext,
  opts?: { deviceId?: string | null; cloudEnabled?: boolean },
): Promise<Suggestion[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts?.deviceId) headers['X-Device-Id'] = opts.deviceId
  if (opts?.cloudEnabled) headers['X-Cloud-Enabled'] = 'true'

  const res = await fetch(`${baseUrl}/api/v1/suggest`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ctx),
  })
  if (!res.ok) {
    throw new Error(`Suggest request failed: ${res.statusText}`)
  }
  const json: ApiResponse<Suggestion[]> = await res.json()
  if (!json.success) {
    throw new Error(json.error ?? 'Unknown error from suggest endpoint')
  }
  return json.data ?? []
}

// ── AI status ─────────────────────────────────────────────────────────────────

export async function fetchAiStatus(
  baseUrl: string,
  opts?: { deviceId?: string | null; includeCloud?: boolean },
): Promise<AiStatus> {
  const url = new URL(`${baseUrl}/api/v1/ai/status`)
  if (opts?.includeCloud && opts?.deviceId) {
    url.searchParams.set('cloud', 'true')
  }

  const headers: Record<string, string> = {}
  if (opts?.deviceId) headers['X-Device-Id'] = opts.deviceId

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`AI status request failed: ${res.statusText}`)
  const json: ApiResponse<AiStatus> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? 'Unknown error')
  return json.data
}

// ── Streaming generate ────────────────────────────────────────────────────────

/**
 * Stream an AI-generated response via SSE.
 *
 * Calls onChunk for each text fragment and optionally onMeta when the server
 * reports which provider is serving the request. Throws QuotaExceededError on
 * cloud quota exhaustion. Returns when the stream is done or the AbortSignal
 * fires.
 */
export async function streamGenerate(
  baseUrl: string,
  request: GenerateRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  opts?: {
    deviceId?: string | null
    cloudEnabled?: boolean
    onMeta?: (meta: { provider: 'ollama' | 'cloud' }) => void
  },
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts?.deviceId) headers['X-Device-Id'] = opts.deviceId

  const body: GenerateRequest = {
    ...request,
    cloudEnabled: opts?.cloudEnabled ?? false,
  }

  const res = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Generate failed (${res.status}): ${text}`)
  }
  if (!res.body) throw new Error('No response body from generate endpoint')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    // Keep the last potentially-incomplete line in the buffer
    buf = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      try {
        const data = JSON.parse(raw) as {
          chunk?: string
          done?: boolean
          error?: string
          meta?: { provider?: string }
          resetAt?: string
        }
        if (data.error) {
          if (data.error === 'quota_exceeded') {
            throw new QuotaExceededError(data.resetAt ?? null)
          }
          throw new Error(data.error)
        }
        if (data.done) return
        if (data.chunk) onChunk(data.chunk)
        if (data.meta?.provider && opts?.onMeta) {
          const provider = data.meta.provider === 'ollama' ? 'ollama' : 'cloud'
          opts.onMeta({ provider })
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue // malformed frame — skip
        throw err
      }
    }
  }
}

// ── Template processing ───────────────────────────────────────────────────────

export async function processTemplate(
  baseUrl: string,
  template: string,
  variables: Record<string, string>,
): Promise<ProcessTemplateResponse> {
  const res = await fetch(`${baseUrl}/api/v1/process-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template, variables }),
  })
  if (!res.ok) throw new Error(`Template processing failed: ${res.statusText}`)
  const json: ApiResponse<ProcessTemplateResponse> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? 'Template error')
  return json.data
}
