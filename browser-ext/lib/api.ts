import type { AiStatus, GenerateRequest, ProcessTemplateResponse, Suggestion, SuggestContext } from '../types'

interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
}

// ── Suggestions ───────────────────────────────────────────────────────────────

export async function fetchSuggestions(baseUrl: string, ctx: SuggestContext): Promise<Suggestion[]> {
  const res = await fetch(`${baseUrl}/api/v1/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function fetchAiStatus(baseUrl: string): Promise<AiStatus> {
  const res = await fetch(`${baseUrl}/api/v1/ai/status`)
  if (!res.ok) throw new Error(`AI status request failed: ${res.statusText}`)
  const json: ApiResponse<AiStatus> = await res.json()
  if (!json.success || !json.data) throw new Error(json.error ?? 'Unknown error')
  return json.data
}

// ── Streaming generate ────────────────────────────────────────────────────────

/**
 * Stream an AI-generated response via SSE.
 *
 * Calls onChunk for each text fragment. Returns when the stream is done
 * or the AbortSignal fires.
 */
export async function streamGenerate(
  baseUrl: string,
  request: GenerateRequest,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/v1/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
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
        const data = JSON.parse(raw) as { chunk?: string; done?: boolean; error?: string }
        if (data.error) throw new Error(data.error)
        if (data.done) return
        if (data.chunk) onChunk(data.chunk)
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
