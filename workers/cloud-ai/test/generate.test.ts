import { describe, it, expect, vi, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import type { Env } from '../src/types';

const testEnv = {
  ...env,
  DAILY_QUOTA: '50',
  IP_DAILY_QUOTA: '200',
  DEFAULT_GROQ_MODEL: 'llama3-8b-8192',
  DEFAULT_GEMINI_MODEL: 'gemini-1.5-flash',
  GROQ_API_KEY: 'test-groq-key',
  GEMINI_API_KEY: 'test-gemini-key',
} as unknown as Env;

function groqSseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const lines = [
    ...chunks.map(
      (c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c }, finish_reason: null }] })}\n\n`,
    ),
    'data: [DONE]\n\n',
  ];
  const body = lines.join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  const keys = await testEnv.RATE_LIMIT.list();
  for (const key of keys.keys) {
    await testEnv.RATE_LIMIT.delete(key.name);
  }
});

describe('POST /v1/generate', () => {
  it('returns 400 when X-Device-Id is missing', async () => {
    const req = new Request('https://worker.test/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hi' }),
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('X-Device-Id');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('https://worker.test/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-1' },
      body: 'not-json',
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });

  it('streams SSE frames from Groq and records usage', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.includes('groq.com')) {
        return new Response(groqSseBody(['hello', ' world']), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const req = new Request('https://worker.test/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': 'dev-stream',
        'CF-Connecting-IP': '10.0.0.1',
      },
      body: JSON.stringify({ prompt: 'hi', stream: true }),
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('"chunk":"hello"');
    expect(text).toContain('"chunk":" world"');
    expect(text).toContain('"done":true');
    expect(text).toContain('"meta"');

    // Allow the fire-and-forget recordUsage KV writes (device + IP) to settle
    // before the isolated storage frame closes.
    await new Promise((r) => setTimeout(r, 50));
    const quota = await testEnv.RATE_LIMIT.get(`quota:dev-stream:${new Date().toISOString().slice(0, 10)}`, 'json') as { count: number } | null;
    expect(quota?.count).toBe(1);
  });

  it('returns 429 when device quota is exhausted', async () => {
    const lowQuotaEnv = { ...testEnv, DAILY_QUOTA: '0' };
    const req = new Request('https://worker.test/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'over-limit' },
      body: JSON.stringify({ prompt: 'hi' }),
    });
    const res = await worker.fetch(req, lowQuotaEnv);
    expect(res.status).toBe(429);
    const body = await res.json() as { error: string; resetAt: string };
    expect(body.error).toBe('quota_exceeded');
    expect(body.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('falls back to Gemini when Groq fails', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      calls++;
      if (url.includes('groq.com')) {
        return new Response('Service unavailable', { status: 503 });
      }
      // Gemini success
      const body = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini-response' }] } }] })}\n\n`;
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new TextEncoder().encode(body));
            c.close();
          },
        }),
        { status: 200 },
      );
    });

    const req = new Request('https://worker.test/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': 'dev-fallback', 'CF-Connecting-IP': '1.1.1.1' },
      body: JSON.stringify({ prompt: 'hi' }),
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('"provider":"gemini"');
    expect(calls).toBeGreaterThan(1); // Both providers were called.
    // Allow the fire-and-forget recordUsage KV write to settle before the
    // isolated storage frame closes.
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe('GET /v1/health', () => {
  it('returns quota info for a device', async () => {
    const req = new Request('https://worker.test/v1/health?device=health-test');
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { providers: string[]; quota: { remaining: number } };
    expect(body.providers).toContain('groq');
    expect(body.providers).toContain('gemini');
    expect(body.quota.remaining).toBe(50);
  });

  it('returns 400 when device is missing', async () => {
    const req = new Request('https://worker.test/v1/health');
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(400);
  });
});
