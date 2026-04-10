import { handleGenerate } from './routes/generate';
import { handleHealth } from './routes/health';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/v1/generate' || url.pathname === '/v1/generate/') {
      return handleGenerate(request, env);
    }

    if (url.pathname === '/v1/health' || url.pathname === '/v1/health/') {
      return handleHealth(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};
