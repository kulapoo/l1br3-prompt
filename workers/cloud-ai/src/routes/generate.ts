/**
 * POST /v1/generate
 *
 * Privacy guarantee: this route logs ONLY { deviceId, ts, provider, status }.
 * It NEVER logs prompt text, options, or response content.
 *
 * Request headers:
 *   X-Device-Id: <uuid>  (required)
 *
 * Request body:
 *   { prompt: string, model?: string, options?: object, stream?: boolean }
 *
 * Response: SSE stream matching the backend's frame format:
 *   data: {"meta": {"provider": "groq"}}
 *   data: {"chunk": "..."}
 *   data: {"done": true}
 *   data: {"error": "..."}    (on failure)
 */
import { checkDeviceQuota, checkIpQuota, recordUsage } from '../rateLimit';
import { resolveStream } from '../providers/chain';
import { chunkFrame, doneFrame, errorFrame, metaFrame, sseResponse } from '../sse';
import type { Env, GenerateBody } from '../types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
};

export async function handleGenerate(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const deviceId = request.headers.get('X-Device-Id');
  if (!deviceId) {
    return Response.json({ error: 'X-Device-Id header is required' }, { status: 400, headers: CORS_HEADERS });
  }

  // ── IP quota (anti-spoofing) ──────────────────────────────────────────────────
  const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
  const ipOk = await checkIpQuota(env, ip);
  if (!ipOk) {
    return Response.json({ error: 'Rate limit exceeded (IP)' }, { status: 429, headers: CORS_HEADERS });
  }

  // ── Device quota ──────────────────────────────────────────────────────────────
  const quota = await checkDeviceQuota(env, deviceId);
  if (quota.remaining <= 0) {
    return Response.json(
      { error: 'quota_exceeded', resetAt: quota.resetAt },
      { status: 429, headers: CORS_HEADERS },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: GenerateBody;
  try {
    body = await request.json() as GenerateBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
  }
  if (!body.prompt || typeof body.prompt !== 'string') {
    return Response.json({ error: 'prompt is required' }, { status: 400, headers: CORS_HEADERS });
  }

  // ── Stream generation ─────────────────────────────────────────────────────────
  async function* generateFrames(): AsyncGenerator<string> {
    let usageRecorded = false;
    try {
      const { stream, provider } = await resolveStream(env, body.prompt, body.model);
      yield metaFrame({ provider });

      for await (const chunk of stream) {
        if (!usageRecorded) {
          // Record usage on first successful chunk — don't count failures.
          recordUsage(env, deviceId!, ip).catch(() => {});
          usageRecorded = true;
        }
        yield chunkFrame(chunk);
      }
      yield doneFrame();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal error';
      yield errorFrame(msg);
    }
  }

  return sseResponse(generateFrames());
}
