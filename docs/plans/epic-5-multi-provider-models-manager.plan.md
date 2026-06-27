# Plan: EPIC-5 — Multi-Provider Models Manager  ✅

**Roadmap**: EPIC-5 (100%) — F13 (frontend, shipped separately) · F14 · F15 · F16
**Source PRD**: `docs/prds/multi-provider-models-manager.prd.md`

> Consolidated from three milestone plans (M1–M3). All shipped. Wire shape evolved across the
> three milestones: M1 carries the key in the request body, M2 adds FE role resolution, M3 moves
> the key to encrypted server storage and the wire carries only a `providerId`.

```
M1:  byok = { type, apiKey, baseUrl?, model? }   (key in request body, bridge)
M2:  roleRouter resolves role → byok              (FE-only; no backend change)
M3:  byok = { providerId }                        (key never leaves server)
```

## M1 — BYOK Inference (F14) · ✅ Shipped

Real backend provider classes for OpenAI, Anthropic, and OpenAI-compatible endpoints behind the
existing `AIProvider` Protocol; `resolve_provider` accepts a per-request `byok` field and streams
through the existing `/generate` + `/transform` SSE routes (unchanged frame contract).

- New: `services/ai/openai_provider.py`, `services/ai/anthropic_provider.py`; `ByokProviderConfig`
  added to `GenerateRequest` / `TransformRequest`.
- Factory BYOK branch fails loudly on `health()` failure — no silent Ollama downgrade for explicit BYOK.
- Error map: 401→`auth_error`, 429→`rate_limited`, 404→`model_not_found`, other→generic `ProviderError`→503.
- No migration, no DB change, no FE change in M1.
- Evidence: `docs/testing/multi-provider-models-manager.byok-inference.tdd.md`.

## M2 — Role-Aware Default Routing (F15) · ✅ Shipped

FE-only resolver (`browser-ext/lib/roleRouter.ts`) maps per-purpose Default Model Assignment
(`AppConfig.ai.assignments[role]`) → M1's `byok` wire shape. `/generate` resolves as Chat role,
`/transform` as Transformation role. Missing/unkeyed/disabled assignment → implicit Ollama
fallback (never hard-fails the user).

- Pure util + colocated vitest; `AppConfig.ai.activeProvider` widened to `string | null`.
- No backend edits, no migration, no new endpoints.

## M3 — Encrypted Server-Side Key Storage (F16) · ✅ Shipped

BYOK keys moved from `browser.storage.local` to encrypted server-side storage bound to
`127.0.0.1`. Plaintext key never travels back to the browser.

- Master key: env `L1BR3_MASTER_KEY`, auto-generated to `~/.l1br3/master.key` (0600); Fernet
  symmetric encryption; rotation = re-enter keys.
- New `ai_providers` table `(id, type, base_url, encrypted_api_key)`; migration `004_ai_providers`.
- New `POST/GET/PATCH/DELETE /api/v1/providers` — `ProviderRead` exposes `has_key: bool` only;
  plaintext key physically omitted from every response, error, and log.
- `resolve_provider` accepts `providerId`; decrypts in-process; constructs the provider with the key.
- FE: Models Manager POSTs key once on create/update then sends only `providerId`; `roleRouter`
  flips from `apiKey` → `providerId`; "no `serverProviderId`" replaces "no `apiKey`" as the Ollama-fallback trigger.
- On decrypt failure (master-key mismatch): explicit 503, not a generic error.
- New `api/app/services/security/crypto.py` (Fernet `encrypt`/`decrypt`); `app/config.py::get_master_key()`.
