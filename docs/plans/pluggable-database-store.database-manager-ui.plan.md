# Plan: Pluggable Database Store — Database Manager UI (Milestone 3)

**Source PRD**: `docs/prds/pluggable-database-store.prd.md`
**Selected Milestone**: #3 — Database Manager UI (settings page mirroring Models Manager: engine select, form/connection-string, test, set-active)
**Complexity**: Large

## Summary

Add a Database Manager that lets a user configure database connections through the admin UI —
engine selector, guided (host/port/db/user/pass) **or** advanced "paste connection string" input,
test-connection, and set-active — mirroring the AI Models Manager pattern (F14) end to end. The
backend persists connection configs in a **file** (`~/.l1br3/databases.json`, 0600) read before any
DB connection is made; the registry consults the stored active connection first, so set-active
survives restarts. SQLite remains the zero-config default (auto-seeded into the file on first run).
This milestone ships the **management plumbing + SQLite experience only** — no data migration on
switch (M4) and no encrypted credential storage (M5).

## Decisions on PRD Open Questions (locked for this plan)

| OQ | Decision for M3 | Rationale |
|---|---|---|
| #56 Connection-test UX | **`POST /api/v1/databases/test` — 5s timeout, redacted errors, no secret leakage** | The connection form lands in M3, so the test endpoint ships with it. A throwaway engine is built, pinged, and disposed; the URL/password never appears in any response or log |
| #57 Rollback semantics | **Deferred (M4)** | M3 does no data copy. On activate, if the target fails its connection test or `alembic upgrade head`, the active connection is **left unchanged** (source stays active) and the redacted error is returned. Data-copy rollback is M4 |

## Scope lock (what is / isn't in M3)

**In scope**
- File-backed connection store (`~/.l1br3/databases.json`, 0600; path overridable via
  `L1BR3_DATABASES_CONFIG`): CRUD + `active_id`. Atomic write (temp + `os.replace`).
- Canonical connection representation = a **SQLAlchemy URL string**. The guided form builds it; the
  "paste connection string" mode is a passthrough. Both converge on one URL the engine consumes.
- `POST /api/v1/databases/test` — throwaway-engine connection test returning `ConnectionTest`
  (the M1 seam at `db/engines/base.py:16-21`, finally exercised).
- `/api/v1/databases` CRUD + `POST /{id}/activate` (test → migrate target → swap active → reload
  the registry singleton so the new DB takes effect for subsequent requests).
- Read shape omits credentials (parses the URL into non-secret structured fields + `hasPassword` +
  a masked URL) — mirrors `ProviderRead`'s `has_key`-only key signal.
- Registry precedence becomes: **stored active connection > `L1BR3_DATABASE_URL` > `L1BR3_DB_PATH`
  > default**. `get_active_engine()` consults the store first; `reload_active_engine()` invalidates
  the cached singleton.
- Frontend `DatabaseManager` (Manager + Card + EditModal + engineMeta) hosted as a new `databases`
  view in `AdminLayout`, plus `lib/api.ts` client fns + `types/index.ts` types.

**Out of scope (explicitly deferred)**
- Data migration / copy from source → target on switch → **M4** (activate switches to an empty,
  migrated target; the user is warned the target has no copied data).
- Encrypted credential storage at rest → **M5**. M3 stores the connection URL (which may embed a
  password) in plaintext inside the 0600 config file — same exposure surface philosophy as
  `config.py`'s `master.key`. M5 retrofits `crypto.encrypt`/`decrypt` onto the credential fields.
- MySQL, in-browser wa-sqlite, multi-write replication → PRD-level out-of-scope.

## Why a config file (not a DB table, not `browser.storage.local`)

1. **Chicken-and-egg**: connection configs cannot live in the DB they describe. When the active DB
   is Postgres, `get_db()` yields Postgres sessions — reading a config table would need a second,
   separate bootstrap connection to an unknown location. A file is read before any DB connection.
2. **Survives API restarts**: the API process (not the extension) must know which DB to connect to
   at boot. The extension's `browser.storage.local` is invisible to the API; only API-side storage
   works. A file is the simplest API-side store.
3. **Mirrors existing precedent**: `api/app/config.py:31-44` already manages a file (`master.key`)
   with 0600 perms in `~/.l1br3/`. The connection store follows that exact pattern.
4. **Respects the M3/M5 boundary**: no encryption now (M5's job); the file is the clean seam M5
   wraps. Reusing the `ai_providers` encrypted table would pre-empt M5 **and** hit chicken-and-egg.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| CRUD route | `api/app/routes/providers.py:12-62` | `_to_read()` omits secret; `ApiResponse` envelope; `201` on create; `404` on missing |
| Write-only secret schema | `api/app/schemas/provider.py:11-44` | `_camel` config; Create accepts secret, Update makes it optional, Read physically omits it + exposes `has_key` |
| Encrypt-on-write (M5 target, **not** used now) | `api/app/services/provider_service.py:46-47` | The shape M5 will retrofit; M3 stores plaintext in the file instead |
| File-based config + 0600 | `api/app/config.py:31-44` | `path.parent.mkdir(parents=True, exist_ok=True)`; `path.write_text`; `path.chmod(0o600)`; cached module global |
| ConnectionTest seam | `api/app/db/engines/base.py:16-21` | `@dataclass(frozen=True) ConnectionTest(ok, error)` — holds no secrets, safe to serialize |
| Cached singleton + override | `api/app/db/engines/registry.py:14-25` | Module-level `_active_engine`; `get_active_engine()` builds on first access; `set_active_engine()` overrides |
| Alembic URL source | `api/migrations/env.py:13` | Reads `get_active_engine().url` — flows automatically once the registry consults the store |
| Route test + leak assertion | `api/tests/test_provider_routes.py:29-46,83-95` | `assert SECRET not in r.text`; `assert "apiKey" not in body`; ciphertext-not-plaintext check |
| Engine catalog (FE) | `browser-ext/components/models/providerMeta.ts:3-59` | `ProviderMeta` interface + `PROVIDER_META` record; `fixed` flag for the default; `PROVIDER_ORDER` |
| Manager component (FE) | `browser-ext/components/models/ModelsManager.tsx:57-138` | `saveProvider`/`runTest` async fns; card grid over `PROVIDER_ORDER`; modal open state |
| Card component (FE) | `browser-ext/components/models/ProviderCard.tsx:43-52,162-177` | `MaskedKey`; test button with `idle/testing/ok/fail` state |
| Admin view switcher | `browser-ext/components/AdminLayout.tsx:23,55-73,93-96` | `AdminView` union; switcher buttons; conditional render |
| API client (FE) | `browser-ext/lib/api.ts:103-161` | `ServerProviderRead` interface; `listProviders`/`createProvider`/`updateProvider`/`deleteProvider` |
| FE types block | `browser-ext/types/index.ts:82-111` | Domain types grouped under a section banner |

## Files to Change

### Backend

| File | Action | Why |
|---|---|---|
| `api/app/db/connection_store.py` | CREATE | File-backed CRUD: `list/get/add/update/delete` connections + `get_active_id`/`set_active`; atomic write; 0600; seed default SQLite on first read |
| `api/app/schemas/database.py` | CREATE | `DatabaseConnectionCreate`/`Update`/`Read`/`ConnectionTestRequest`/`ConnectionTestResponse`; camelCase; Read parses URL → non-secret fields + `hasPassword` + masked URL |
| `api/app/services/db_connection_service.py` | CREATE | `test_connection(engine, url) -> ConnectionTest` (throwaway engine, 5s, redacted); `activate(id)` (test → `alembic upgrade head` on target → `set_active` → `reload_active_engine`) |
| `api/app/routes/databases.py` | CREATE | `/api/v1/databases` GET/POST/GET{id}/PATCH/DELETE + `POST /test` + `POST /{id}/activate`; `_to_read` omits credentials |
| `api/app/db/engines/registry.py` | UPDATE | `get_active_engine()` consults `connection_store` active URL first; add `reload_active_engine()` |
| `api/app/db/engines/__init__.py` | UPDATE | Re-export `reload_active_engine` |
| `api/app/main.py` | UPDATE | Register `databases_router` (import + `include_router`) |
| `api/tests/test_connection_store.py` | CREATE | File CRUD, active swap, atomic write, 0600 perms, malformed-file fallback, default seeding |
| `api/tests/test_db_connection_service.py` | CREATE | `test_connection` ok/fail/timeout (mocked `create_engine`); redaction; `activate` happy/swap-only-on-success |
| `api/tests/test_database_routes.py` | CREATE | Route integration mirroring `test_provider_routes.py`: CRUD, test, activate, **never leak password/URL secret** |

### Frontend

| File | Action | Why |
|---|---|---|
| `browser-ext/components/databases/engineMeta.ts` | CREATE | `ENGINE_META`: `sqlite` (`fixed`, default), `postgresql`; defaultPort, supportsConnectionString |
| `browser-ext/components/databases/DatabaseManager.tsx` | CREATE | Manager mirroring `ModelsManager`: list, add/edit modal, test, activate, active badge |
| `browser-ext/components/databases/ConnectionCard.tsx` | CREATE | Card mirroring `ProviderCard`: engine, masked URL, test/activate/edit/delete |
| `browser-ext/components/databases/ConnectionEditModal.tsx` | CREATE | Modal mirroring `ProviderEditModal`: guided form + advanced "paste connection string" toggle |
| `browser-ext/components/databases/DatabaseManager.test.tsx` | CREATE | Component test mirroring `ModelsManager.test.tsx` |
| `browser-ext/components/AdminLayout.tsx` | UPDATE | Add `databases` to `AdminView` + switcher + render |
| `browser-ext/lib/api.ts` | UPDATE | Add `listDatabases`/`createDatabase`/`updateDatabase`/`deleteDatabase`/`testDatabase`/`activateDatabase` |
| `browser-ext/types/index.ts` | UPDATE | Add `DbEngine`/`DatabaseConnectionRead`/`DatabaseConnectionCreate`/`ConnectionTestResult` |

## Connection Representation (decision)

The canonical stored value is a **SQLAlchemy URL string** (`url`), because that is exactly what
`SqliteEngine(url)` / `PostgresEngine(url)` (M2) consume — no stored/runtime representation skew.

- Guided form inputs `(engine, host, port, database, username, password)` →
  `build_url(engine, host, port, database, username, password)` produces e.g.
  `postgresql://user:pass@host:5432/db` (URL-encoded credentials). SQLite form → `sqlite:///<path>`.
- Advanced mode → the pasted string is validated by parsing it
  (`sqlalchemy.engine.url.make_url`) and re-serialized; invalid → 422 with a redacted message.
- Read path parses the stored URL back into non-secret fields for the edit form; **password is
  write-only** (blank on edit with a "enter to change" placeholder, like the provider key). A
  `hasPassword` flag mirrors `has_key`.

## Tasks

### Task 1: `connection_store` — file-backed CRUD (RED→GREEN)
- **Action**: Create `db/connection_store.py`:
  - `_config_path()` → `L1BR3_DATABASES_CONFIG` env or `~/.l1br3/databases.json`.
  - `_load()` → parse JSON `{"connections": [...], "active_id": str|None}`; on missing/malformed
    file, return a freshly-seeded default (the default SQLite connection, `active_id` = its id) and
    log — never crash the app boot on a bad config file.
  - `list_connections()`, `get_connection(id)`, `add_connection(*, label, engine, url) -> id`,
    `update_connection(id, *, label=None, url=None)`, `delete_connection(id)` (refuse if it is
    active or is the seeded default), `get_active_id()`, `set_active(id)`.
  - `_save(data)` → atomic: write `path.with_suffix(".json.tmp")` then `os.replace`; `chmod 0o600`.
  - Connection record: `{id, label, engine: "sqlite"|"postgresql", url, created_at}` (iso UTC).
- **Mirror**: `config.py:31-44` (file + 0600 + mkdir parents); `provider_repo.py:16-45` (CRUD shape).
- **Validate**: `cd api && uv run pytest tests/test_connection_store.py`.

### Task 2: Schemas + URL redaction (RED→GREEN)
- **Action**: Create `schemas/database.py`:
  - `_camel` config (mirror `schemas/provider.py:6`).
  - `DatabaseConnectionCreate`: `label`, `engine: Literal["sqlite","postgresql"]`, `url: str`
    (accepts either guided-built or pasted). Validator: `make_url(url)` must succeed.
  - `DatabaseConnectionUpdate`: all optional.
  - `DatabaseConnectionRead`: `id`, `label`, `engine`, `hasPassword: bool`, plus parsed non-secret
    fields (`host`, `port`, `database`, `path`) and `maskedUrl` (password replaced with `***`).
    **No `url`/`password` field** — physically omitted (load-bearing, like `ProviderRead`).
  - `ConnectionTestRequest`: `engine`, `url`. `ConnectionTestResponse`: mirrors `ConnectionTest`.
  - A module-level `_redact(url) -> str` helper (password → `***`) used by both Read and test errors.
- **Mirror**: `schemas/provider.py:11-44` (Create/Update/Read + `_camel` + omit-the-secret).
- **Validate**: `cd api && uv run pytest tests/test_database_routes.py -k schema` (rejection + masking).

### Task 3: `test_connection` service (RED→GREEN)
- **Action**: Create `services/db_connection_service.py::test_connection(engine_type, url)`:
  - Build a throwaway `create_engine(url)` (no `check_same_thread` for non-sqlite), `engine.connect()`
    executing `SELECT 1` inside a `timeout` (use a short connect timeout via `connect_args` /
    `async`-free `with engine.connect()`); `engine.dispose()` in `finally`.
  - Return `ConnectionTest(ok=True)` on success; on any exception return
    `ConnectionTest(ok=False, error=_redact_message(exc))` — the message must not contain the URL,
    password, or full DSN (assert by test).
  - 5s budget (PRD OQ #56 decision).
- **Mirror**: `db/engines/base.py:16-21` (`ConnectionTest`); redaction philosophy from
  `provider_service.py:69-81` (never surface raw secret material).
- **Validate**: `cd api && uv run pytest tests/test_db_connection_service.py -k test_connection`.

### Task 4: `activate` service (RED→GREEN)
- **Action**: In the same module, `activate(id)`:
  1. `get_connection(id)`; `test_connection(...)` — on fail, return the redacted `ConnectionTest`
     **without** changing `active_id` (source stays active; PRD OQ #57 decision).
  2. Run `alembic upgrade head` against the target URL (mirror `main.py:_run_migrations` but pointed
     at the target engine) so the target schema exists. On failure, leave `active_id` unchanged and
     return the redacted error.
  3. `connection_store.set_active(id)`; `reload_active_engine()` (Task 6).
  4. Return the new active `DatabaseConnectionRead`.
- **Mirror**: `main.py:18-25` (`alembic.command.upgrade`); `registry.set_active_engine`.
- **Validate**: `cd api && uv run pytest tests/test_db_connection_service.py -k activate`.

### Task 5: Routes (RED→GREEN)
- **Action**: Create `routes/databases.py` mirroring `routes/providers.py`:
  - `GET /api/v1/databases` → list (Read shape).
  - `POST /api/v1/databases` → create (201).
  - `GET/PATCH/DELETE /api/v1/databases/{id}` (404 on missing; DELETE refuses the active/default).
  - `POST /api/v1/databases/test` → `test_connection` (does not persist).
  - `POST /api/v1/databases/{id}/activate` → `activate`.
  - `_to_read(model_dict)` parses URL → Read (no credentials).
- **Mirror**: `routes/providers.py:12-62`.
- **Validate**: `cd api && uv run pytest tests/test_database_routes.py`.

### Task 6: Registry store-precedence + reload (RED→GREEN)
- **Action**: Update `db/engines/registry.py`:
  - `get_active_engine()`: before the env path, consult `connection_store.get_active_id()`; if set,
    read its URL and build the engine by dialect (sqlite → `SqliteEngine(url)`; postgresql →
    `PostgresEngine(url)` **when M2 lands** — until then a postgresql active URL raises an
    actionable `ValueError` pointing at M2). Fall through to env/default if no stored active.
  - Add `reload_active_engine()` → `_active_engine = None` then `get_active_engine()`.
  - Update `db/engines/__init__.py` to re-export `reload_active_engine`.
- **Mirror**: `registry.py:14-25` (singleton + override); M2's dialect branch composes here later.
- **Validate**: `cd api && uv run pytest tests/test_db_engine.py -k registry` (extend with a
  store-active-precedence case using a tmp `L1BR3_DATABASES_CONFIG`).

### Task 7: Wire router + migration env (GREEN)
- **Action**: In `main.py`, import + `include_router(databases_router)` alongside `providers_router`.
  Confirm `migrations/env.py:13` already picks up the store-active URL via `get_active_engine().url`
  (no env.py change expected).
- **Mirror**: `main.py:14,67`.
- **Validate**: `cd api && uv run pytest`; `cd api && L1BR3_TESTING= uv run alembic upgrade head`
  smoke against a tmp DB (migrations still flow).

### Task 8: Frontend types + API client (RED→GREEN)
- **Action**:
  - `types/index.ts`: add a "Database Manager" section: `DbEngine = "sqlite"|"postgresql"`,
    `DatabaseConnectionRead` (no password field), `DatabaseConnectionCreate`, `ConnectionTestResult`.
  - `lib/api.ts`: add `listDatabases`/`createDatabase`/`updateDatabase`/`deleteDatabase`/
    `testDatabase`/`activateDatabase`, each unwrapping the `ApiResponse` envelope (mirror
    `listProviders`…`deleteProvider`).
- **Mirror**: `lib/api.ts:103-161`; `types/index.ts:82-111`.
- **Validate**: `cd browser-ext && pnpm test lib/__tests__/api.test.ts` (extend with db client cases);
  `cd browser-ext && npx tsc --noEmit`.

### Task 9: Frontend `DatabaseManager` + Card + Modal + engineMeta (RED→GREEN)
- **Action**:
  - `databases/engineMeta.ts`: `ENGINE_META` (`sqlite` `fixed` default; `postgresql` with
    `defaultPort: 5432`, `supportsConnectionString: true`); `ENGINE_ORDER`.
  - `databases/ConnectionCard.tsx`: mirror `ProviderCard` — engine label, masked URL, `hasPassword`,
    test button (`idle/testing/ok/fail`), Activate (radio-style active badge), Edit, Delete.
  - `databases/ConnectionEditModal.tsx`: mirror `ProviderEditModal` — engine select; guided fields
    (host/port/db/user/pass) **and** an "Advanced: paste connection string" toggle that swaps to a
    single URL input; password write-only (placeholder on edit).
  - `databases/DatabaseManager.tsx`: mirror `ModelsManager` — fetch list, card grid, add/edit modal,
    runTest → `testDatabase`, activate → `activateDatabase`, active badge; warn-on-activate that the
    target will be empty until M4 ships data migration.
- **Mirror**: `components/models/{providerMeta,ProviderCard,ProviderEditModal,ModelsManager}.tsx`.
- **Validate**: `cd browser-ext && pnpm test components/databases`.

### Task 10: AdminLayout view + regression (GREEN)
- **Action**: In `AdminLayout.tsx`, extend `AdminView` with `'databases'`, add a switcher button
  (Database icon), and render `<DatabaseManager />` for that view. Confirm existing workbench/models
  views unchanged.
- **Mirror**: `AdminLayout.tsx:23,55-73,93-96`.
- **Validate**: `cd browser-ext && pnpm test`; `cd browser-ext && npm run lint`.

## Validation

```bash
# ── Backend: focused, during TDD loops ──
cd api && uv run pytest tests/test_connection_store.py
cd api && uv run pytest tests/test_db_connection_service.py
cd api && uv run pytest tests/test_database_routes.py
cd api && uv run pytest tests/test_db_engine.py -k registry

# ── Backend: full gate (AGENTS.md: `just lint` is incomplete — run these explicitly) ──
cd api && uv run pytest
cd api && uv run ruff check .
cd api && uv run ruff format --check .
cd api && uv run mypy app

# ── Backend: security — no secret leakage ──
cd api && uv run pytest tests/test_database_routes.py tests/test_db_connection_service.py -k "leak or redact or password"

# ── Backend: zero-config preserved (no env, fresh file) ──
cd api && L1BR3_DATABASES_CONFIG=/tmp/m3_empty.json uv run python -c \
  "from app.db.connection_store import list_connections, get_active_id; cs=list_connections(); print(len(cs), get_active_id() is not None)"
#   → 1 True  (default SQLite seeded + active)

# ── Backend: store-active overrides env (precedence) ──
cd api && L1BR3_DB_PATH=/tmp/m3_env.db L1BR3_DATABASES_CONFIG=/tmp/m3_store.json uv run python -c \
  "from app.db.connection_store import add_connection, set_active, get_active_id; \
   cid=add_connection(label='t', engine='sqlite', url='sqlite:////tmp/m3_store_active.db'); set_active(cid); \
   from app.db.engines.registry import get_active_engine; print(get_active_engine().url)"
#   → sqlite:////tmp/m3_store_active.db  (store wins over L1BR3_DB_PATH)

# ── Frontend ──
cd browser-ext && pnpm test
cd browser-ext && npm run lint
cd browser-ext && npx tsc --noEmit
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| M2 (`PostgresEngine`) not landed → Postgres **activate** unexercisable end-to-end | High | Test-connection is engine-agnostic (throwaway `create_engine(url)` works for any dialect) and fully tested. The persistent Postgres *activation* path is wired behind a clear actionable error until M2's registry dialect branch lands; SQLite activate is the regression gate. Documented as integration-gated, mirroring M2's `L1BR3_PG_TEST_URL` skip idiom |
| Credential leakage in errors / responses | High | `_redact` helper on every URL/error surface; Read schema physically omits `url`/`password`; dedicated tests asserting the secret appears in **no** response body, error, or log (mirror `test_provider_routes.py:29-46`). Full security-review pass before ship (PRD risk #64) |
| Mid-session engine swap leaves stale open sessions / in-flight requests | Medium | `reload_active_engine()` rebuilds the singleton; in-flight requests finish on the prior session (acceptable — next request uses the new DB). Documented; no request-level pooling of the old engine beyond the response |
| Config file corruption crashes app boot | Medium | `_load()` returns the seeded default on any parse error and logs; never raises from a bad file. Atomic write (temp + `os.replace`) prevents torn writes |
| `alembic upgrade head` on activate hits a non-empty unrelated DB | Medium | M3 scope is empty/migrated targets; the migrate step surfaces a redacted error on failure and does **not** swap active. Data copy is M4. Surface a clear "target not empty — use the migration wizard (M4)" path if rows exist |
| Postgres URL parsing edge cases (special chars in password) | Low | `make_url` round-trip + URL-encoding on the guided-build path; redaction test covers `@`/`:`/`%` in passwords |
| Frontend stores connection in `browser.storage.local` by mistake | Low | DB connections are **server-side only**; the manager reads via `listDatabases()` each render, never via `AppConfig`. No `AppConfig.database` field is added |

## Acceptance

- [ ] All tasks complete
- [ ] `cd api && uv run pytest` green on the default SQLite gate — zero regressions
- [ ] `ruff check` / `ruff format --check` / `mypy app` clean on new + changed files
- [ ] `cd browser-ext && pnpm test` + `npm run lint` + `tsc --noEmit` clean
- [ ] `POST /api/v1/databases/test` returns `ConnectionTest`; the URL/password appears in **no**
      response, error, or log (asserted by dedicated tests)
- [ ] `/api/v1/databases` CRUD + activate work end-to-end against SQLite; read shape never exposes
      credentials
- [ ] Store-active precedence holds: stored active > `L1BR3_DATABASE_URL` > `L1BR3_DB_PATH` > default
- [ ] Fresh install with no env / no config file works identically to today (default SQLite seeded +
      active) — zero-config preserved
- [ ] `DatabaseManager` renders in a new `databases` admin view; guided form + paste-connection-string
      mode both produce a valid URL; test + activate + active badge work
- [ ] Patterns mirrored from `providers.py` / `providerMeta.ts` / `ModelsManager.tsx`, not reinvented
- [ ] PRD milestone #3 row updated: `pending` → `in-progress`, Plan cell set to this artifact's path

---
*Next: Milestone 4 (Migration wizard) — re-run `/plan docs/prds/pluggable-database-store.prd.md` once M3 ships. M2 (Postgres engine) should land before/alongside M3's Postgres activate path is fully exercisable.*
