# l1br3 Cloud AI Worker

A Cloudflare Worker that proxies AI generation requests to Groq and Gemini, acting as the **free cloud fallback** for the l1br3-prompt browser extension when Ollama is unavailable.

## Overview

- **Providers**: Groq (`llama3-8b-8192`) → Gemini (`gemini-1.5-flash`) fallback chain
- **Quota**: 50 requests/day per device, 200/day per IP (anti-spoofing)
- **Privacy**: logs only `{ deviceId, ts, provider, status }` — never your prompt text or responses
- **Wire format**: SSE frames — `{meta}`, `{chunk}`, `{done}`, `{error}`
- **CORS**: `*` (extension connects from `chrome-extension://` origin)

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is fine)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed: `npm install -g wrangler`
- Free [Groq API key](https://console.groq.com/) (required — primary provider)
- Free [Gemini API key](https://aistudio.google.com/app/apikey) (required — fallback provider)

## First-Time Setup

### 1. Install dependencies

```bash
cd workers/cloud-ai
pnpm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

### 3. Create the KV namespace

```bash
wrangler kv namespace create "l1br3-rate-limit"
# → outputs something like: id = "abc123..."

wrangler kv namespace create "l1br3-rate-limit" --preview
# → outputs: preview_id = "def456..."
```

Open `wrangler.toml` and replace the placeholder values:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "abc123..."          # ← paste the id from above
preview_id = "def456..."  # ← paste the preview_id from above
```

### 4. Add API key secrets

```bash
wrangler secret put GROQ_API_KEY
# (paste your Groq key when prompted)

wrangler secret put GEMINI_API_KEY
# (paste your Gemini key when prompted)
```

> **Security**: Never put API keys in `wrangler.toml` or source code. `wrangler secret put` encrypts them and stores them in Cloudflare's secret store.

## Development

Start a local dev server (requires the KV namespace to exist):

```bash
just dev-worker
# or directly:
cd workers/cloud-ai && wrangler dev --local --port 8787
```

Smoke test:

```bash
curl 'http://localhost:8787/v1/health?device=test-device-1' | jq

curl -N -X POST http://localhost:8787/v1/generate \
  -H 'X-Device-Id: test-device-1' \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"say hello in one sentence","stream":true}'
```

## Deploy

```bash
just deploy-worker
# or directly:
cd workers/cloud-ai && wrangler deploy
```

Wrangler prints your worker's URL, e.g. `https://l1br3-cloud-ai.<your-subdomain>.workers.dev`.

## Pointing the Backend at Your Worker

Set `L1BR3_CLOUD_AI_URL` in the API's environment before starting it:

```bash
L1BR3_CLOUD_AI_URL=https://l1br3-cloud-ai.<your-subdomain>.workers.dev just dev-api
```

Or add it to your `api/.env` file:

```
L1BR3_CLOUD_AI_URL=https://l1br3-cloud-ai.<your-subdomain>.workers.dev
```

The default (`https://cloud-ai.l1br3-prompt.workers.dev`) points at the canonical l1br3 deploy, which may not exist until the project has a public deployment. **Set your own URL** for self-hosted use.

## Tests

```bash
just test-worker
# or directly:
cd workers/cloud-ai && pnpm test
```

All 16 tests run inside Miniflare (no real API keys needed — providers are mocked via `vi.stubGlobal('fetch', ...)`).

## Cost Model (Free Tier)

| Resource | Free allowance | Usage at 50 req/day × 1000 devices |
|---|---|---|
| Cloudflare Workers | 100,000 req/day | 50,000 req/day ✓ |
| Groq (llama3-8b-8192) | 30 RPM / ~14,400/day | well within limits ✓ |
| Gemini (gemini-1.5-flash) | generous free tier | fallback only ✓ |
| Cloudflare KV reads | 100,000/day | ~150,000 (rate check per req) — may exceed |
| Cloudflare KV writes | 1,000/day | ~50 (one per req) ✓ |

At scale, KV reads are the binding constraint. Consider upgrading to Workers Paid ($5/mo) if you expect >100 active devices/day.

## Privacy Contract

| Logged | Not logged |
|---|---|
| Anonymous device hash + date (KV key) | Prompt text |
| IP SHA-256 hash + date (KV key) | Response text |
| Provider used (`groq`/`gemini`) | Raw IP address |
| Success/error status | User identity |
| Request timestamp | |

KV entries expire automatically after 48 hours.
