# Cloud AI Fallback

## What It Is (and Isn't)

The Cloud AI Fallback lets you use l1br3-prompt's AI features — Suggestions, Enhance, and Compose modifiers — even when [Ollama](https://ollama.com) isn't installed or running on your machine.

When the fallback is enabled and Ollama is unavailable, the extension sends your prompt through a Cloudflare Worker that proxies to Groq (`llama3-8b-8192`) with Gemini (`gemini-1.5-flash`) as a secondary option. The active provider is always shown in the extension's status bar.

**What it is not:**

- A replacement for Ollama. Local AI is unlimited, private, and zero-latency. The cloud fallback is an opt-in convenience for Ollama-less setups.
- A way to skip quota limits. Each device gets 50 requests per day.
- A logged service. Your prompts and responses are never stored.

## Privacy Contract

| What gets logged | What never gets logged |
|---|---|
| Anonymous device hash + date | Your prompt text |
| IP SHA-256 hash + date | Your response text |
| Provider used (groq/gemini) | Your raw IP address |
| Success/error status | Any user identity |

All counters are stored in Cloudflare KV with a 48-hour TTL and automatically expire. No third-party analytics.

## How to Enable It

1. Open the extension sidebar (`Ctrl+Shift+Y` or via browser action).
2. Go to **Settings** → **AI** → **Cloud AI Fallback**.
3. Toggle it on.

That's it. The extension auto-generates a random anonymous device ID on first launch — you'll never be asked to sign in.

## Quota

**50 requests per device per day**, reset at UTC midnight.

The current quota is shown in Settings while the fallback is enabled:

> `32/50 requests remaining today · resets at 00:00`

A progress bar turns amber as you approach the limit. When the quota is exhausted, any generate attempt shows a toast:

> *Cloud quota exhausted, resets at 00:00. Install Ollama for unlimited local AI.*

After reset the counter goes back to 50 automatically.

## Prefer Unlimited Local AI?

Install [Ollama](https://ollama.com) and pull a model:

```bash
ollama pull llama3:8b
```

Then start the l1br3 backend:

```bash
just dev-api
```

Ollama is always preferred over the cloud fallback. If Ollama is running when you generate, the status bar shows **Ollama** (indigo). Cloud fallback shows **Cloud AI** (amber).

## Self-Hosting the Worker

The default worker URL (`https://cloud-ai.l1br3-prompt.workers.dev`) assumes a canonical l1br3 deployment. To run your own:

1. Follow the [worker setup guide](../workers/cloud-ai/README.md).
2. Deploy: `just deploy-worker`
3. Set `L1BR3_CLOUD_AI_URL=https://your-worker.workers.dev` in your API environment.

You control the quota limits, API keys, and data retention policy.
