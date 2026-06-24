# Plan: Multi-Provider Models Manager — BYOK Inference (Milestone 1, refresh)

**Source PRD**: `docs/prds/multi-provider-models-manager.prd.md`
**Selected Milestone**: #1 — BYOK inference works end-to-end (roadmap F14)
**Complexity**: Medium-Large

## Summary

Add real backend provider classes for OpenAI, Anthropic, and OpenAI-compatible endpoints behind
the existing `AIProvider` Protocol, and extend `resolve_provider` so a request carrying a BYOK
provider config + key streams a response from that provider. Milestone 1 is backend-complete and
validated at the API level; per-request key transport (no DB/migration) bridges until Milestone 3
ships encrypted server-side storage.

## Decisions on PRD Open Questions (locked for this plan)

| OQ | Decision | Rationale |
|---|---|---|
| #4 Request path | **Browser → API (127.0.0.1) → provider** | Reuses existing `/generate` + `/transform` SSE routes and frame contract; centralizes error mapping; CORS stays on extension domain; sets up cleanly for M3 |
| #3 Model listing | **`GET /v1/models` with graceful fallback to empty list** | Both OpenAI + Anthropic support it; OpenAI-compatible servers that don't return empty — frontend already allows manual entry |
| #5 Error mapping | **401→`auth_error`, 429→`rate_limited`, 404→`model_not_found`, other→generic `ProviderError`** | Routes already map `ProviderError`→HTTP 503; structured messages let the frontend show specific guidance |
| #1 Encryption | **Deferred to M3** | Not needed for M1 (per-request key, no persistence) |
| #2 Fallback policy | **Deferred to M2** | M1 only activates BYOK when explicitly requested; existing Ollama path untouched |

**Key transport for M1**: the browser sends the key in the request body via a new `byok` field.
This is no worse than today's `browser.storage.local` (still localhost-bound). Milestone 3 replaces
it with encrypted server storage.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Provider class shape | `api/app/services/ai/ollama.py` | Constructor takes `http: httpx.AsyncClient`; `health()`/`generate()`/`stream()`; `_stream_impl` async generator; map `httpx.HTTPError`→`ProviderError` at the boundary |
| Provider protocol | `api/app/services/ai/provider.py` | `@runtime_checkable` Protocol — new classes duck-type, do NOT subclass |
| Factory/selection | `api/app/services/ai/factory.py` | Return `tuple[AIProvider, label, ProviderStatus]`; raise `ProviderError` with actionable message |
| SSE route | `api/app/routes/generate.py` | Inline `data: {json}\n\n` frames (`meta`/`chunk`/`done`/`error`); disconnect check via `request.is_disconnected()` |
| Pydantic schema (camelCase) | `api/app/schemas/ai.py` | `model_config = _camel` (alias generator + `populate_by_name`); `Literal[...]` for enums |
| Streaming test | `api/tests/test_generate.py` | Build SSE body with a local helper; mock upstream via `httpx_mock` fixture; assert on `r.text` frame contents |
| Factory test | `api/tests/test_ai_factory.py` | `_FakeRequest` stub exposing `app.state.http`; `pytest.mark.asyncio`; plain `assert` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `api/app/schemas/ai.py` | UPDATE | Add `ByokProviderConfig`; extend `GenerateRequest` with optional `byok` field |
| `api/app/schemas/transform.py` | UPDATE | Extend `TransformRequest` with optional `byok` field |
| `api/app/services/ai/openai_provider.py` | CREATE | `OpenAIProvider` — covers `openai` + `openai_compatible` via `base_url` param |
| `api/app/services/ai/anthropic_provider.py` | CREATE | `AnthropicProvider` — Anthropic Messages API + SSE event format |
| `api/app/services/ai/factory.py` | UPDATE | Add BYOK resolution branch ahead of Ollama fallback |
| `api/app/routes/generate.py` | UPDATE | Pass `byok=req.byok` into `resolve_provider` |
| `api/app/routes/transform.py` | UPDATE | Pass `byok=req.byok` into `resolve_provider` |
| `api/tests/test_openai_provider.py` | CREATE | Unit tests: stream parse, health, error mapping |
| `api/tests/test_anthropic_provider.py` | CREATE | Unit tests: stream parse (event format), health, error mapping |
| `api/tests/test_ai_factory.py` | UPDATE | BYOK resolution precedence; falls through when `byok=None` |
| `api/tests/test_generate_byok.py` | CREATE | Integration: end-to-end SSE through `/generate` with mocked OpenAI + Anthropic |

**No migration, no DB change, no frontend change in Milestone 1.** Frontend wiring (sending the
`byok` field from the extension) is Milestone 2's routing work.

## Tasks

### Task 1: Extend request schemas (RED→GREEN)
- **Action**: Add `ByokProviderConfig` (`type: Literal["openai","anthropic","openai_compatible"]`, `api_key: str`, `base_url: str | None = None`, `model: str | None = None`) to `schemas/ai.py`. Add `byok: ByokProviderConfig | None = None` to `GenerateRequest` and `TransformRequest`.
- **Mirror**: `schemas/ai.py:33-39` (`_camel` config, `Literal`).
- **Validate**: `cd api && uv run pytest tests/test_ai_routes.py -k byok` (write the schema-rejection test first).

### Task 2: `OpenAIProvider` class (RED→GREEN)
- **Action**: Create `services/ai/openai_provider.py`. Constructor `(http, api_key, base_url="https://api.openai.com/v1")`. Implements `AIProvider`:
  - `_headers()` → `{"Authorization": f"Bearer {api_key}"}`.
  - `health()` → `GET {base}/models` (5s timeout) → `ProviderStatus(reachable, models=ids)`; swallow exceptions → `reachable=False`.
  - `generate()` → `POST {base}/chat/completions` non-streaming; map 401/429/404.
  - `stream()` → `_stream_impl` async gen: `POST {base}/chat/completions` with `stream:true`; parse `data: {"choices":[{"delta":{"content":...}}]}` lines; stop on `data: [DONE]`.
  - Error map: 401→`ProviderError("auth_error: invalid API key")`, 429→`rate_limited`, 404→`model_not_found`, other HTTP→`ProviderError(f"openai error: {status}")`; `httpx.HTTPError`→`ProviderError`.
- **Mirror**: `cloud.py:25-163` (identical structure).
- **Validate**: `cd api && uv run pytest tests/test_openai_provider.py`.

### Task 3: `AnthropicProvider` class (RED→GREEN)
- **Action**: Create `services/ai/anthropic_provider.py`. Constructor `(http, api_key, base_url="https://api.anthropic.com/v1")`.
  - `_headers()` → `{"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}`.
  - `health()` → `GET {base}/models`.
  - `generate()` → `POST {base}/messages` with `max_tokens`; collect `content[].text`.
  - `stream()` → parse Anthropic SSE event format: `event: content_block_delta` + `data: {"delta":{"text":...}}`; stop on `event: message_stop`.
  - Same error-map strategy as Task 2.
- **Mirror**: `cloud.py` structure; diverges only in SSE parse + headers.
- **Validate**: `cd api && uv run pytest tests/test_anthropic_provider.py`.

### Task 4: Factory BYOK branch (RED→GREEN)
- **Action**: Extend `resolve_provider` to accept `byok: ByokProviderConfig | None = None`. If `byok` present, construct the matching provider (`openai`/`openai_compatible`→`OpenAIProvider`, `anthropic`→`AnthropicProvider`), call `health()`, return `(provider, label=f"byok:{byok.type}", status)`. If `health()` fails, raise `ProviderError("BYOK provider unreachable: ...")` — do **not** fall through to Ollama (explicit BYOK request should fail loudly, not silently downgrade). Existing Ollama path unchanged when `byok=None`.
- **Mirror**: `factory.py:8-40` (tuple return, ProviderError with actionable text).
- **Validate**: `cd api && uv run pytest tests/test_ai_factory.py -k byok`.

### Task 5: Route wiring (GREEN)
- **Action**: Update `/generate` (`routes/generate.py`) and `/transform` (`routes/transform.py`) to pass `byok=req.byok` into `resolve_provider`. Verify the `meta` frame's `provider` label reflects `byok:{type}`. No other route changes — SSE frame construction stays inline.
- **Mirror**: `generate.py:36-40` (existing `resolve_provider` call site).
- **Validate**: `cd api && uv run pytest tests/test_generate_byok.py`.

### Task 6: Regression guard (GREEN)
- **Action**: Confirm existing `test_generate.py`, `test_transform.py`, `test_ai_factory.py` stay green — the `byok=None` default must leave all current behavior untouched.
- **Validate**: `cd api && uv run pytest`.

## Validation

```bash
# Focused, during TDD loops
cd api && uv run pytest tests/test_openai_provider.py tests/test_anthropic_provider.py
cd api && uv run pytest tests/test_ai_factory.py -k byok
cd api && uv run pytest tests/test_generate_byok.py

# Full gate before claiming done (AGENTS.md: lint is incomplete, run these explicitly)
cd api && uv run pytest
cd api && uv run ruff check .
cd api && uv run ruff format --check .
cd api && uv run mypy app

# Security: confirm no key leakage in payloads or logs
cd api && uv run pytest tests/test_generate_byok.py -k "api_key or key"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| OpenAI SSE `delta` shape varies (empty content, tool calls) | Medium | Parse defensively — only yield when `delta.content` is a non-empty string; ignore other delta keys |
| Anthropic SSE event set is larger than documented (ping, content_block_start, etc.) | Medium | Ignore all events except `content_block_delta` (yields text) and `message_stop` (ends); log ignored event types at DEBUG |
| `byok` field accidentally logged with key | Low | Never log `req.byok`; add an explicit test asserting the key does not appear in captured logs |
| Per-request key transport feels insecure to reviewers | Low | Document in code comment + PR description that this is M1's bridge; M3 moves to encrypted storage; API is 127.0.0.1-bound |
| Frontend sends `byok` before M2 wires it | Low | `byok` defaults to `None`; no frontend change in this plan, so no client sends it yet |

## Acceptance
- [x] All tasks complete — evidence: `docs/testing/multi-provider-models-manager.byok-inference.tdd.md`
- [x] `uv run pytest` green (175 passed, including existing suite — no regressions)
- [x] `mypy app/services/ai` clean; `ruff check` — 2 pre-existing `UP035` warnings in `ollama.py` (not introduced by M1)
- [x] Integration test proves a mocked OpenAI/Anthropic stream yields the full `meta`/`chunk`/`done` frame sequence through `/generate`
- [x] API key never appears in any response payload, error message, or log line (asserted by test)
- [x] Existing Ollama resolution path unchanged when `byok=None`
- [x] Patterns mirrored from `ollama.py` / `factory.py`, not reinvented

---
*Status: COMPLETE. Next: Milestone 2 (role-aware default routing) — `/plan docs/prds/multi-provider-models-manager.prd.md` again, scoping M2.*
