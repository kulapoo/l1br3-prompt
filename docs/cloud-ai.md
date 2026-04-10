# Cloud AI Fallback — Architecture & Deployment

Phase 6 adds a free cloud AI fallback using a **Cloudflare Worker** proxy that sits between the local backend and the upstream AI providers (Groq and Gemini). Users who don't run local Ollama can still use AI features, rate-limited at **50 requests/day** per anonymous device ID.

---

## Request flow

```
Browser Extension
    │
    │  X-Device-Id header, cloudEnabled flag
    ▼
Local Backend (FastAPI, 127.0.0.1:8000)
    │
    │  AI provider factory: try Ollama → try Cloud
    ▼
Cloudflare Worker  (workers/cloud-ai/)
    │
    │  Rate-limit check (KV), then forward
    ├──► Groq API (primary, OpenAI-compatible)
    └──► Gemini API (fallback on Groq failure)
```

All SSE frames emitted by the worker use the same format as the backend's Ollama path:

```
data: {"meta": {"provider": "groq"}}   ← which provider served this request
data: {"chunk": "text fragment"}
data: {"chunk": "more text"}
data: {"done": true}
data: {"error": "message"}             ← on failure or quota exceeded
```

---

## Privacy guarantees

The worker **never logs prompt text, model parameters, or response content**. The only data logged or stored is:

| Data | Where | Why |
|---|---|---|
| Anonymous device ID | Cloudflare KV (TTL 48h) | Per-device daily quota counter |
| Hashed source IP | Cloudflare KV (TTL 48h) | Anti-spoofing (200/day IP cap) |
| `{deviceId, ts, provider, status}` | Cloudflare request log | Ops visibility |

The device ID is a `crypto.randomUUID()` generated in the extension on first launch — it is not tied to any user account or PII.

---

## Identity & quota

- Extension generates a UUID `deviceId` on first launch and persists it in `browser.storage.local`.
- Every AI request sends `X-Device-Id: <uuid>` to the backend, which forwards it to the worker.
- Worker enforces **50 req/day per device** (resets at UTC midnight) via Cloudflare KV.
- Backend shows live quota in the `/ai/status?cloud=true` response and surfaces it in Settings.

---

## Provider chain

1. **Groq** (primary) — OpenAI-compatible API, fastest available model is `llama3-8b-8192`.
2. **Gemini** (fallback) — used when Groq returns any non-2xx status. Default model: `gemini-1.5-flash`.

The worker peeks at the first chunk to confirm Groq succeeded before committing, then falls through to Gemini if it fails.

---

## Configuration

### Backend env vars

| Variable | Default | Description |
|---|---|---|
| `L1BR3_CLOUD_AI_URL` | `https://cloud-ai.l1br3-prompt.workers.dev` | Worker base URL. Override to self-host. |

### Worker vars (wrangler.toml)

| Variable | Default | Description |
|---|---|---|
| `DAILY_QUOTA` | `50` | Per-device daily request limit |
| `IP_DAILY_QUOTA` | `200` | Per-IP daily cap (anti-spoofing) |
| `DEFAULT_GROQ_MODEL` | `llama3-8b-8192` | Default Groq model |
| `DEFAULT_GEMINI_MODEL` | `gemini-1.5-flash` | Default Gemini model |

### Worker secrets (set via `wrangler secret put`, never committed)

| Secret | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key — get one free at console.groq.com |
| `GEMINI_API_KEY` | Gemini API key — get one free at aistudio.google.com |

---

## Self-hosting the worker

If you want to run your own worker with your own API keys:

```bash
# 1. Install worker dependencies
just install-worker

# 2. Create KV namespace
cd workers/cloud-ai
pnpm dlx wrangler kv namespace create RATE_LIMIT
# Copy the ID from output and update wrangler.toml

# 3. Set secrets
pnpm dlx wrangler secret put GROQ_API_KEY
pnpm dlx wrangler secret put GEMINI_API_KEY

# 4. Deploy
just deploy-worker
# Note the output URL (e.g. https://l1br3-cloud-ai.<subdomain>.workers.dev)

# 5. Point your backend at your worker
export L1BR3_CLOUD_AI_URL=https://l1br3-cloud-ai.<subdomain>.workers.dev
just dev-api
```

---

## Local development (no deploy)

```bash
# Terminal 1: worker on :8787
just dev-worker

# Terminal 2: backend pointed at local worker
L1BR3_CLOUD_AI_URL=http://127.0.0.1:8787 just dev-api

# Terminal 3: extension
just dev-ext
```

In the extension: stop Ollama, open Settings, enable **Cloud AI Fallback**, and run a prompt in Compose.

---

## Testing

```bash
# Backend unit + integration tests (worker mocked via pytest_httpx)
just test-api

# Worker tests (vitest-pool-workers)
just test-worker

# Quota enforcement smoke (against local wrangler dev)
for i in $(seq 1 51); do
  curl -s -X POST http://127.0.0.1:8787/v1/generate \
    -H "X-Device-Id: smoke-test" \
    -H "Content-Type: application/json" \
    -d '{"prompt":"hi","stream":false}' > /dev/null
done
# 51st request should return 429 with resetAt field
```

---

## Free-tier limits

| Provider | Free limit | l1br3 mitigation |
|---|---|---|
| Cloudflare Worker | 100k req/day | Well within limit at current scale |
| Groq | 30 req/min global | Worker enforces 50/day/device; burst risk low |
| Gemini (AI Studio) | Varies | Used as fallback only |
| KV reads/writes | 100k reads/day free | One KV read + one write per request |
