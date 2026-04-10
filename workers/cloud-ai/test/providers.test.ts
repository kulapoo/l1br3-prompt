import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamGroq, GroqError } from '../src/providers/groq';
import { streamGemini, GeminiError } from '../src/providers/gemini';

// Helper: build an SSE stream string from chunks (Groq format).
function groqSseBody(chunks: string[], done = true): ReadableStream<Uint8Array> {
  const lines: string[] = chunks.map(
    (c) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: c }, finish_reason: null }] })}\n\n`,
  );
  if (done) lines.push('data: [DONE]\n\n');
  const body = lines.join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

// Helper: Gemini SSE body.
function geminiSseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const lines = chunks.map(
    (c) =>
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: c }] } }] })}\n\n`,
  );
  const body = lines.join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('streamGroq', () => {
  it('yields chunks in order', async () => {
    vi.stubGlobal('fetch', async () => new Response(groqSseBody(['hello', ' world']), { status: 200 }));
    const chunks: string[] = [];
    for await (const c of streamGroq('key', 'hi', 'llama3-8b-8192')) {
      chunks.push(c);
    }
    expect(chunks).toEqual(['hello', ' world']);
  });

  it('throws GroqError on non-200', async () => {
    vi.stubGlobal('fetch', async () => new Response('Unauthorized', { status: 401 }));
    await expect(async () => {
      for await (const _ of streamGroq('bad-key', 'hi', 'llama3-8b-8192')) {
        // consume
      }
    }).rejects.toThrow(GroqError);
  });
});

describe('streamGemini', () => {
  it('yields chunks in order', async () => {
    vi.stubGlobal('fetch', async () => new Response(geminiSseBody(['foo', ' bar']), { status: 200 }));
    const chunks: string[] = [];
    for await (const c of streamGemini('key', 'hi', 'gemini-1.5-flash')) {
      chunks.push(c);
    }
    expect(chunks).toEqual(['foo', ' bar']);
  });

  it('throws GeminiError on non-200', async () => {
    vi.stubGlobal('fetch', async () => new Response('Error', { status: 503 }));
    await expect(async () => {
      for await (const _ of streamGemini('bad-key', 'hi', 'gemini-1.5-flash')) {
        // consume
      }
    }).rejects.toThrow(GeminiError);
  });
});
