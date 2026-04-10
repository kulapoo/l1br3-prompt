import { checkDeviceQuota } from '../rateLimit';
import type { Env, HealthResponse } from '../types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
};

/**
 * GET /v1/health?device=<deviceId>
 *
 * Returns provider availability and the device's current quota.
 * Read-only — does not mutate KV state.
 */
export async function handleHealth(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device') ?? request.headers.get('X-Device-Id');
  if (!deviceId) {
    return Response.json({ error: 'Missing device parameter' }, { status: 400, headers: CORS_HEADERS });
  }

  const quota = await checkDeviceQuota(env, deviceId);

  const body: HealthResponse = {
    providers: ['groq', 'gemini'],
    quota,
  };

  return Response.json(body, { headers: CORS_HEADERS });
}
