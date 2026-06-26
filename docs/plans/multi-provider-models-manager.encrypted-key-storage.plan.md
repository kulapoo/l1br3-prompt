# Plan: Multi-Provider Models Manager — Encrypted Server-Side Key Storage (Milestone 3)

**Source PRD**: `docs/prds/multi-provider-models-manager.prd.md`
**Selected Milestone**: #3 — Encrypted server-side key storage (roadmap F16)
**Complexity**: Medium-Large

## Decisions (locked for this plan)

| OQ | Decision | Rationale |
|---|---|---|
| #1 Master key source | **Env var `L1BR3_MASTER_KEY`**, auto-generated on first run to `~/.l1br3/master.key` (0600), overridable via env | Matches existing `L1BR3_*` env convention; zero new native deps; Fernet (symmetric) gives authenticated encryption; key loss = re-enter keys, which is acceptable for a 127.0.0.1-bound local app |
| #4 Wire shape | **Extension sends `providerId`; backend decrypts in-process** | Plaintext key never travels back to the browser — directly satisfies the M3 success metric |

**Migration seam (from M2 plan risk):** the existing `roleRouter.ts` "no apiKey → Ollama fallback" rule stays valid — after M3 a provider with no server-side key is treated as unkeyed and falls back, so the migration is non-breaking.

**Scope boundary:** only the *secret* (apiKey) moves server-side. Non-secret provider config (label, model, enabled, assignments) stays in `browser.storage.local` as F13 built it, minimizing churn.

## Summary

Add a backend `ai_providers` table holding `(id, type, base_url, encrypted_api_key)`, encrypt keys at rest with Fernet keyed by `L1BR3_MASTER_KEY`, expose provider CRUD endpoints that accept the plaintext key only on write (never on read), and change `/generate`+`/transform` to accept a `providerId` reference that the backend resolves → decrypts → injects into the existing `AIProvider` constructor. The extension's Models Manager POSTs the key once on create/update and thereafter sends only `providerId`. The M1/M2 `byok` wire shape drops `apiKey`, adds `providerId`.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Model definition | `api/app/models/transform_mode.py` | SQLAlchemy 2.0 declarative |
| Migration | `api/migrations/versions/003_transform_modes.py` | Alembic `revision_id`/`down_revision`, `op.create_table` |
| Config via env | `api/app/db/engines/sqlite.py:93,117` | `os.environ.get("L1BR3_...")`, lazy init, `~/.l1br3/` dir |
| SSE route + provider chokepoint | `api/app/routes/generate.py:34` → `services/ai/factory.py:11` | `resolve_provider(request, byok=...)` is the single injection point; `AIProvider(http, api_key=, base_url=)` constructor is where the decrypted key lands |
| ApiResponse envelope | all `app/routes/*.py` | `{ success, data, error, metadata }` |
| Key-leak test | `tests/test_generate_byok.py` (M1) | assert apiKey absent from response + logs |
| Test bootstrap | `tests/conftest.py` | `Base.metadata.create_all` auto-creates new non-FTS tables — **no manual SQL needed** for `ai_providers` |
| Pure util + colocated test | `browser-ext/lib/roleRouter.ts` + `.test.ts` | vitest globals, sibling `.test.ts` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `api/pyproject.toml` | UPDATE | Add `cryptography>=43` dep |
| `api/app/config.py` | CREATE | `get_master_key()` — read `L1BR3_MASTER_KEY` or generate+persist `~/.l1br3/master.key` (0600); cache in module global |
| `api/app/services/security/crypto.py` | CREATE | Fernet `encrypt(plaintext) -> bytes`, `decrypt(token) -> str`; lazily build Fernet from `get_master_key()` |
| `api/app/models/ai_provider.py` | CREATE | `ai_providers` table: `id (UUID str pk)`, `type`, `base_url`, `encrypted_api_key (LargeBinary)`, `created_at`, `updated_at` |
| `api/app/models/__init__.py` | UPDATE | Export `AIProviderModel` |
| `api/migrations/versions/004_ai_providers.py` | CREATE | `op.create_table("ai_providers")`; `down_revision = "003"` |
| `api/app/schemas/provider.py` | CREATE | `ProviderCreate{type,base_url,api_key}`, `ProviderUpdate{api_key?,base_url?}`, `ProviderRead{id,type,base_url,has_key:bool}` — **no `api_key` on read** |
| `api/app/schemas/ai.py` | UPDATE | `ByokProviderConfig`: drop `api_key`, add `provider_id: str`; keep `type`/`base_url`/`model`; add deprecation note |
| `api/app/repositories/provider_repo.py` | CREATE | `create/get/get_by_id/list/update_key/delete` — pure SQL, returns model rows |
| `api/app/services/provider_service.py` | CREATE | Encrypt on write, decrypt on read-internal; `resolve_for_inference(provider_id) -> (type, api_key, base_url)` |
| `api/app/routes/providers.py` | CREATE | `POST/GET/PATCH/DELETE /api/v1/providers`; responses never include plaintext key; `has_key: bool` only |
| `api/app/routes/ai.py` | UPDATE | Optionally augment `/ai/status` with provider count (no keys) |
| `api/app/services/ai/factory.py` | UPDATE | `resolve_provider`: when `byok.provider_id` set, call `provider_service.resolve_for_inference` → decrypt → construct provider; keep per-request path for tests |
| `api/app/main.py` | UPDATE | Register providers router |
| `api/tests/test_crypto.py` | CREATE | Round-trip, tamper detection, wrong-master-key failure |
| `api/tests/test_provider_routes.py` | CREATE | CRUD; GET never returns key; PATCH updates ciphertext |
| `api/tests/test_generate_byok.py` | UPDATE | Switch from `byok.api_key` to `byok.provider_id` (seed a provider row); keep key-leak assertions |
| `api/tests/conftest.py` | UPDATE | If needed, seed master key to a fixed test value (`L1BR3_MASTER_KEY`); no FTS SQL needed |
| `browser-ext/types/index.ts` | UPDATE | `AiProviderConfig.apiKey` → remove; add `serverProviderId: string \| null`; `ByokRequestConfig`: drop `apiKey`, add `providerId` |
| `browser-ext/lib/api.ts` | UPDATE | Add `createProvider/updateProvider/deleteProvider/listProviders`; `streamGenerate`/`streamTransform` send `providerId` not `apiKey` |
| `browser-ext/lib/roleRouter.ts` | UPDATE | Emit `{ providerId, model, type?, baseUrl? }`; "no serverProviderId" → Ollama fallback (replaces "no apiKey") |
| `browser-ext/lib/roleRouter.test.ts` | UPDATE | Flip assertions from apiKey to providerId |
| `browser-ext/components/ModelsManager.tsx` (or equivalent) | UPDATE | Provider form: POST key to backend on save; clear local apiKey; surface `has_key` from server |

## Tasks

### Task 1 — Crypto foundation (RED→GREEN)
- **Action**: Add `cryptography` dep; build `app/config.py::get_master_key()` + `app/services/security/crypto.py` (Fernet encrypt/decrypt).
- **Mirror**: `db/engines/sqlite.py` lazy env pattern.
- **Validate**: `cd api && uv run pytest tests/test_crypto.py -q`.

### Task 2 — Provider table + migration
- **Action**: `models/ai_provider.py`, export, migration `004`.
- **Mirror**: `models/transform_mode.py` + migration `003`.
- **Validate**: `cd api && uv run alembic upgrade head` (non-test DB); `uv run pytest` still green.

### Task 3 — Provider CRUD service + routes
- **Action**: repo + service (encrypt on write) + `routes/providers.py`. `ProviderRead` exposes `has_key: bool`, never plaintext.
- **Mirror**: ApiResponse envelope; existing route handler style.
- **Validate**: `cd api && uv run pytest tests/test_provider_routes.py -q`; assert no `api_key`/`encrypted_api_key` in any GET response body.

### Task 4 — Wire resolve_provider to stored keys
- **Action**: `factory.resolve_provider`: branch on `byok.provider_id` → `provider_service.resolve_for_inference` → decrypt → construct `OpenAIProvider`/`AnthropicProvider` with decrypted key. Keep explicit-key path available for tests only.
- **Mirror**: existing `_byok_provider` mapping.
- **Validate**: `cd api && uv run pytest tests/test_generate_byok.py tests/test_transform.py -q`.

### Task 5 — Migration of existing BYOK tests
- **Action**: Update `test_generate_byok.py` to seed an `ai_providers` row and pass `provider_id` instead of `api_key`. Keep key-leak assertions (grep response + caplog for the secret).
- **Validate**: `cd api && uv run pytest -q`.

### Task 6 — Extension: server-backed provider CRUD client
- **Action**: `lib/api.ts` provider endpoints; `types/index.ts` drop `apiKey`, add `serverProviderId`; `roleRouter` emits `providerId`; Models Manager form POSTs key on save.
- **Mirror**: `roleRouter.ts` pure resolver + sibling test.
- **Validate**: `cd browser-ext && pnpm test && npx tsc --noEmit && npm run lint`.

### Task 7 — Regression + security gate
- **Action**: Full suite; manual grep that no plaintext key appears in any response/log.
- **Validate**: `just test` + `just lint`; `cd api && uv run mypy app`.

## Validation

```bash
# Backend
cd api && uv run pytest
cd api && uv run mypy app
cd api && uv run ruff check .
cd api && uv run alembic upgrade head     # on a scratch DB

# Extension
cd browser-ext && pnpm test
cd browser-ext && npx tsc --noEmit
cd browser-ext && npm run lint

# Full gate
just test && just lint
# Security: confirm GET /api/v1/providers and /generate meta frames contain no key material
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Master key loss bricks all stored keys | Medium | Document re-entry flow; key file path surfaced in `/ai/status`; auto-gen with 0600 perms |
| `L1BR3_MASTER_KEY` change after keys stored → silent decrypt failures | Medium | On decrypt failure return explicit 503 "master key mismatch", not a generic error; document rotation = re-enter keys |
| Plaintext key leaks via logs / error / debug payload | Low (Critical impact) | `ProviderRead` schema physically omits key; caplog assertions in tests; `detect-secrets` pre-commit; provider error messages scrubbed before ApiResponse |
| Extension users with keys already in `storage.local` silently lose config on upgrade | Medium | Migration step in Models Manager: if `apiKey` present and no `serverProviderId`, auto-POST to backend on first load, then clear local `apiKey` |
| PyInstaller packaging can't find `cryptography` native bits | Low | Add hidden-imports if needed in `api/build.sh`; verify `just build` produces working binary |
| M2 resolver "no apiKey → fallback" rule changes shape | Low | Becomes "no serverProviderId → fallback"; same semantics, covered by updated `roleRouter.test.ts` |

## Acceptance

- [ ] BYOK keys are encrypted at rest in `ai_providers.encrypted_api_key` (Fernet; verified by inspecting a scratch DB)
- [ ] No endpoint, log line, or SSE frame returns a plaintext key (test assertions + manual grep)
- [ ] `/generate` and `/transform` succeed using only `byok.provider_id` (no key in request body)
- [ ] Existing Ollama-only users are unaffected (full `/generate` + `/transform` suites green)
- [ ] Provider create/update/delete work from the Models Manager; key persists across backend restarts
- [ ] `just test` + `just lint` + `mypy --strict` green
- [ ] PRD OQ#1 resolved (env var) and documented in the plan artifact

---
*Status: IN-PROGRESS. Follows M2 (`docs/plans/multi-provider-models-manager.role-routing.plan.md`). Next: begin Task 1 (crypto foundation) via the TDD workflow.*
