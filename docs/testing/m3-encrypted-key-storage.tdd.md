# TDD Evidence: Multi-Provider Models Manager — Encrypted Server-Side Key Storage (M3)

**Source plan**: `docs/plans/multi-provider-models-manager.encrypted-key-storage.plan.md`
**PRD**: `docs/prds/multi-provider-models-manager.prd.md` (roadmap F16)

## User journeys (from plan)

1. As a user, I want my BYOK API keys stored encrypted on the local backend, so a
   compromised browser-storage dump does not expose them.
2. As a user, I want `/generate` and `/transform` to work using only a provider
   reference (`providerId`), so the plaintext key never travels to/from the
   browser after initial save.
3. As a user, I want provider create/update/delete from the Models Manager, with
   keys persisting across backend restarts.

## Plan-vs-implementation decision (OQ contradiction)

The plan is internally contradictory: the schema-update line says "drop
`api_key`" on `ByokProviderConfig`, but Task 4 says "keep explicit-key path
available for tests only." **Decision:** `ByokProviderConfig` accepts *both*
`provider_id` (primary) and `api_key` (deprecated/test-only), with a validator
requiring exactly one. This is non-breaking, satisfies Task 4, and avoids
rewriting the 7 existing factory unit tests. Documented inline in
`api/app/schemas/ai.py`.

## Task report

| # | Task | Validation run | Result |
|---|------|----------------|--------|
| 1 | Crypto foundation (`app/config.py`, `app/services/security/crypto.py`, `cryptography` dep) | `uv run pytest tests/test_crypto.py -q` | 6 passed |
| 2 | `ai_providers` model + migration `004` | full suite (table auto-created via `Base.metadata`) | green |
| 3 | Provider CRUD (repo/service/schema/routes) | `uv run pytest tests/test_provider_routes.py -q` | 9 passed |
| 4 | `resolve_provider` decrypts stored key via `provider_id` | `uv run pytest tests/test_ai_factory_provider_id.py -q` | 2 passed |
| 5 | BYOK integration tests migrated to `provider_id` | `uv run pytest tests/test_generate_byok.py -q` | 10 passed |
| 6 | Extension client (types, `api.ts`, `roleRouter`, ModelsManager) | `pnpm test && npx tsc --noEmit` | 116 passed, tsc clean |
| 7 | Regression + security gate | `uv run pytest` / `ruff` (new files) / manual grep | 193 passed, new files clean |

## Test specification — guarantees

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Fernet round-trip recovers the plaintext | `tests/test_crypto.py::test_encrypt_decrypt_round_trip` | unit | PASS |
| 2 | Tampered ciphertext is rejected (`InvalidToken`) | `tests/test_crypto.py::test_decrypt_tampered_token_raises` | unit | PASS |
| 3 | Wrong master key fails decryption (rotation detection) | `tests/test_crypto.py::test_decrypt_with_wrong_master_key_raises` | unit | PASS |
| 4 | Master key auto-generated to `~/.l1br3/master.key` with 0600 perms | `tests/test_crypto.py::test_get_master_key_auto_generates_file` | unit | PASS |
| 5 | Provider GET never returns plaintext **or** ciphertext key | `tests/test_provider_routes.py::test_get_list_never_exposes_key_material`, `::test_get_one_never_exposes_key_material` | integration | PASS |
| 6 | `ProviderRead` schema physically omits `api_key` (load-bearing control) | `tests/test_provider_routes.py::test_create_provider_returns_has_key_true_without_key` | integration | PASS |
| 7 | DB column holds Fernet ciphertext, not plaintext | `tests/test_provider_routes.py::test_encrypted_at_rest` | integration | PASS |
| 8 | PATCH rotates the stored key (no leak in response) | `tests/test_provider_routes.py::test_patch_rotates_key` | integration | PASS |
| 9 | `/generate` streams via `providerId` only (no key in request) | `tests/test_generate_byok.py::test_generate_byok_openai_streams_full_frame_sequence` | integration | PASS |
| 10 | API key never appears in any response payload (success or error) | `tests/test_generate_byok.py::test_generate_byok_api_key_never_appears_in_response_payload` | integration | PASS |
| 11 | Unknown `providerId` surfaces explicit 503 (no silent Ollama fallback) | `tests/test_generate_byok.py::test_generate_unknown_provider_id_returns_503` | integration | PASS |
| 12 | `resolve_provider` decrypts stored key and injects into provider | `tests/test_ai_factory_provider_id.py::test_provider_id_resolves_stored_key` (asserts `Authorization: Bearer sk-stored-secret`) | unit | PASS |
| 13 | No-BYOK path unchanged (Ollama regression) | `tests/test_generate_byok.py::test_generate_without_byok_unchanged_uses_ollama` | integration | PASS |
| 14 | `roleRouter` emits `{ providerId }`, falls back on missing server key | `browser-ext/lib/roleRouter.test.ts` (14 cases) | unit | PASS |
| 15 | Components route BYOK via `providerId` | `browser-ext/components/ComposeTab.test.tsx`, `TransformPanel.test.tsx` | unit | PASS |

## Security verification (manual, acceptance criteria)

End-to-end run against a `TestClient` with a real Fernet key:

```
create body contains secret: False
GET list contains secret: False
GET one contains secret: False
GET one has_key: True
ciphertext type: bytes
plaintext substring in ciphertext: False
ciphertext starts with Fernet prefix (gAAAA): True
```

## Coverage and known gaps

- **Backend coverage:** all new modules covered by unit + integration tests
  (crypto, provider CRUD, factory `provider_id` branch, key-leak assertions).
- **Extension coverage:** pure `roleRouter` resolver fully covered; ModelsManager
  delete path now async-tested with mocked `api` module.
- **Known gaps / deliberate omissions:**
  - The plan's "auto-migrate existing `browser.storage.local` apiKey → server"
    one-time migration step (Risks table) is **not** implemented; it is a
    UX nicety for existing users, not a correctness/security requirement.
    New users are unaffected (no prior apiKey).
  - `/ai/status` provider-count enrichment (optional Task 4 bullet) was
    deferred — non-load-bearing.
  - `just lint` / `npm run lint` (ESLint) fails due to a **pre-existing**
    missing `eslint.config.js` for ESLint 9 (verified via `git stash`); not
    introduced by this change.
  - 3 pre-existing `mypy` errors in `app/schemas/envelope.py` and
    `app/routes/mcp.py` (verified pre-existing via `git stash`); all new code
    is mypy-clean.

## Acceptance criteria status

- [x] BYOK keys encrypted at rest in `ai_providers.encrypted_api_key` (Fernet; verified)
- [x] No endpoint/log/SSE frame returns a plaintext key (test assertions + grep)
- [x] `/generate` and `/transform` succeed using only `byok.provider_id`
- [x] Existing Ollama-only users unaffected (full suites green)
- [x] Provider create/update/delete from Models Manager; persists across restarts (server-backed)
- [x] `just test` equivalent green; new files ruff-clean; mypy-clean (pre-existing errors unchanged)
- [x] PRD OQ#1 resolved (env-var master key) and documented
