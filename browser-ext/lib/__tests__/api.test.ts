/**
 * Tests for the SSE parsing logic in streamGenerate.
 *
 * These tests use fetch mocking via vitest — no browser globals needed
 * because we only exercise the pure SSE frame-parsing path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { streamGenerate } from '../api'

function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let idx = 0
  return new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx++]))
      } else {
        controller.close()
      }
    },
  })
}

function makeFetchMock(chunks: string[], status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: makeReadableStream(chunks),
    text: async () => 'error body',
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('streamGenerate — SSE parsing', () => {
  it('collects chunks in order', async () => {
    const sseFrames = [
      'data: {"chunk":"Hello"}\n\n',
      'data: {"chunk":", "}\n\n',
      'data: {"chunk":"world!"}\n\ndata: {"done":true}\n\n',
    ]
    vi.stubGlobal('fetch', makeFetchMock(sseFrames))

    const received: string[] = []
    await streamGenerate('http://localhost:8000', { prompt: 'hi' }, (c) => received.push(c))
    expect(received).toEqual(['Hello', ', ', 'world!'])
  })

  it('handles frames split across read() calls', async () => {
    // Split a single SSE frame across two read() results
    const sseFrames = [
      'data: {"chunk":"split',
      '-me"}\n\ndata: {"done":true}\n\n',
    ]
    vi.stubGlobal('fetch', makeFetchMock(sseFrames))

    const received: string[] = []
    await streamGenerate('http://localhost:8000', { prompt: 'hi' }, (c) => received.push(c))
    expect(received).toEqual(['split-me'])
  })

  it('throws when the server returns an error frame', async () => {
    const sseFrames = ['data: {"error":"Ollama crashed"}\n\n']
    vi.stubGlobal('fetch', makeFetchMock(sseFrames))

    await expect(
      streamGenerate('http://localhost:8000', { prompt: 'hi' }, () => {}),
    ).rejects.toThrow('Ollama crashed')
  })

  it('throws when fetch returns non-OK status', async () => {
    vi.stubGlobal('fetch', makeFetchMock([], 503))

    await expect(
      streamGenerate('http://localhost:8000', { prompt: 'hi' }, () => {}),
    ).rejects.toThrow('503')
  })

  it('respects AbortSignal', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    )

    controller.abort()
    await expect(
      streamGenerate('http://localhost:8000', { prompt: 'hi' }, () => {}, controller.signal),
    ).rejects.toThrow()
  })
})

describe('streamGenerate — model passthrough', () => {
  it('sends model in request body', async () => {
    const sseFrames = ['data: {"done":true}\n\n']
    const mockFetch = makeFetchMock(sseFrames)
    vi.stubGlobal('fetch', mockFetch)

    await streamGenerate('http://localhost:8000', { prompt: 'hi', model: 'mistral:latest' }, () => {})

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.model).toBe('mistral:latest')
  })
})

// ── callApiSource ─────────────────────────────────────────────────────────────

import { callApiSource, callMcpTool, migrateDatabase } from '../api'

function makeJsonFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  })
}

describe('callApiSource', () => {
  it('returns data.rendered from a successful response', async () => {
    vi.stubGlobal('fetch', makeJsonFetch({ success: true, data: { rendered: 'improved text' } }))
    const result = await callApiSource('http://example.com/enhance', 'POST', { content: 'hi', variables: {} })
    expect(result).toBe('improved text')
  })

  it('throws when success is false', async () => {
    vi.stubGlobal('fetch', makeJsonFetch({ success: false, error: 'Bad request', data: null }))
    await expect(callApiSource('http://example.com/enhance', 'POST', { content: 'hi', variables: {} }))
      .rejects.toThrow('Bad request')
  })

  it('throws when fetch returns non-OK status', async () => {
    vi.stubGlobal('fetch', makeJsonFetch({}, 500))
    await expect(callApiSource('http://example.com/enhance', 'POST', { content: 'hi', variables: {} }))
      .rejects.toThrow('500')
  })

  it('sends content and variables in the request body', async () => {
    const mockFetch = makeJsonFetch({ success: true, data: { rendered: 'ok' } })
    vi.stubGlobal('fetch', mockFetch)
    await callApiSource('http://example.com/enhance', 'POST', { content: 'hello', variables: { tone: 'formal' } })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.content).toBe('hello')
    expect(body.variables.tone).toBe('formal')
  })
})

// ── callMcpTool ───────────────────────────────────────────────────────────────

describe('callMcpTool', () => {
  it('returns data.result from a successful response', async () => {
    vi.stubGlobal('fetch', makeJsonFetch({ success: true, data: { result: '["prompt1"]' } }))
    const result = await callMcpTool('http://localhost:8000', 'list_prompts', {})
    expect(result).toBe('["prompt1"]')
  })

  it('throws when success is false', async () => {
    vi.stubGlobal('fetch', makeJsonFetch({ success: false, error: 'Unknown tool', data: null }))
    await expect(callMcpTool('http://localhost:8000', 'bad_tool', {}))
      .rejects.toThrow('Unknown tool')
  })

  it('throws when fetch returns non-OK status', async () => {
    vi.stubGlobal('fetch', makeJsonFetch({}, 503))
    await expect(callMcpTool('http://localhost:8000', 'list_prompts', {}))
      .rejects.toThrow('503')
  })

  it('posts to /api/v1/mcp/call with tool and args', async () => {
    const mockFetch = makeJsonFetch({ success: true, data: { result: 'ok' } })
    vi.stubGlobal('fetch', mockFetch)
    await callMcpTool('http://localhost:8000', 'list_prompts', { query: 'hello' })
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/api/v1/mcp/call')
    const body = JSON.parse(opts.body as string)
    expect(body.tool).toBe('list_prompts')
    expect(body.args.query).toBe('hello')
  })
})

// ── migrateDatabase ───────────────────────────────────────────────────────────

describe('migrateDatabase — SSE parsing', () => {
  it('dispatches meta + progress frames and resolves on done', async () => {
    const sseFrames = [
      'data: {"meta":{"sourceEngine":"sqlite","targetEngine":"postgresql","tables":["tags","prompts"]}}\n\n',
      'data: {"progress":{"table":"tags","phase":"copying","copied":0,"total":2}}\n\n',
      'data: {"progress":{"table":"tags","phase":"done","copied":2,"total":2}}\n\n',
      'data: {"done":true}\n\n',
    ]
    const mockFetch = makeFetchMock(sseFrames)
    vi.stubGlobal('fetch', mockFetch)

    let meta: { sourceEngine: string; tables: string[] } | undefined
    const progress: { table: string; phase: string; copied: number; total: number }[] = []
    await migrateDatabase('http://localhost:8000', 'conn-1', {
      onMigrationMeta: (m) => (meta = m),
      onProgress: (p) => progress.push(p),
    })

    expect(meta).toBeDefined()
    expect(meta!.sourceEngine).toBe('sqlite')
    expect(meta!.tables).toEqual(['tags', 'prompts'])
    expect(progress).toHaveLength(2)
    expect(progress[1]).toEqual({ table: 'tags', phase: 'done', copied: 2, total: 2 })
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8000/api/v1/databases/conn-1/migrate')
    expect(opts.method).toBe('POST')
  })

  it('throws when the server returns an error frame (no done)', async () => {
    const sseFrames = [
      'data: {"meta":{"sourceEngine":"sqlite","targetEngine":"sqlite","tables":[]}}\n\n',
      'data: {"error":"copy failed"}\n\n',
    ]
    vi.stubGlobal('fetch', makeFetchMock(sseFrames))

    await expect(
      migrateDatabase('http://localhost:8000', 'conn-1', { onProgress: () => {} }),
    ).rejects.toThrow('copy failed')
  })

  it('throws when fetch returns non-OK status', async () => {
    vi.stubGlobal('fetch', makeFetchMock([], 400))
    await expect(
      migrateDatabase('http://localhost:8000', 'conn-1', { onProgress: () => {} }),
    ).rejects.toThrow('400')
  })
})
