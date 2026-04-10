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
