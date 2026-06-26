# TDD Evidence: Pluggable Database Store — Database Manager UI (Milestone 3)

**Source plan**: `docs/plans/pluggable-database-store.database-manager-ui.plan.md`
**Source PRD**: `docs/prds/pluggable-database-store.prd.md` (milestone #3)

## Summary

Implemented the Database Manager end-to-end: a file-backed connection store, a
redacted connection-test + activate service, `/api/v1/databases` CRUD + test +
activate routes, registry store-precedence + reload, and a `databases` admin view
(Manager + Card + EditModal + engineMeta + URL builder). SQLite is the zero-config
default; Postgres activate is wired behind M2's landing. Every credential-bearing
surface is redacted and asserted leak-free.

## User journeys (from the plan)

1. View configured databases + which is active.
2. Add a connection via guided form or pasted connection string.
3. Test a connection without leaking the URL/password.
4. Set a connection active (survives restart) — empty/migrated target; data copy is M4.
5. Edit/delete connections (default + active protected from deletion).

## Task report (RED → GREEN)

| # | Task | RED | GREEN | Guarantee |
|---|---|---|---|---|
| 1 | `connection_store` file CRUD + seed | `test_connection_store.py` (ImportError) | 19 passed | File-backed CRUD, atomic 0600 write, default seed, malformed-file fallback |
| 2 | `security/redact.py` | `test_redact.py` (ImportError) | 10 passed | Password scrubbed from URLs/messages; invalid input → `"***"` |
| 2 | `schemas/database.py` | `test_database_routes.py` (ModuleNotFoundError) | schema suite green | Read shape physically omits `url`/`password`; camelCase; URL parse validation |
| 3 | registry store-precedence + `reload_active_engine` | `TestRegistryStorePrecedence` (5 fail) | 5 passed (25 in file) | store active > `L1BR3_DB_PATH`; `L1BR3_DATABASE_URL` wins; reload picks up new active; PG url → actionable error |
| 4 | `test_connection` (throwaway engine) | `test_db_connection_service.py` (ImportError) | 9 passed | ok/fail paths, password never in error, friendly driver-missing msg |
| 4 | `activate` (test→migrate→swap→reload) | same | included above | failure leaves active unchanged; success swaps + reloads registry |
| 5 | `routes/databases.py` | `test_database_routes.py` route suite | 23 passed | CRUD + test + activate; **password never in any response body** (`assert PASSWORD not in r.text`) |
| 6 | wire router in `main.py` | routes 404 before wiring | routes reachable | `databases_router` registered |
| 7 | `migrations/env.py` inject-only-if-empty | — (smoke) | suite green | target migration honored; startup behavior unchanged |
| 8 | frontend `types` + `lib/api.ts` client | `lib/__tests__/databases.test.ts` (8 fail) | 8 passed | envelope unwrap; correct methods/endpoints; throw on `!success` |
| 9 | `connectionUrl` builder (pure) | `connectionUrl.test.ts` (8 fail) | 8 passed | sqlite path (3/4 slashes), pg credentials URL-encoded |
| 9 | `ConnectionEditModal` | `ConnectionEditModal.test.tsx` (4 fail) | 4 passed | guided builds url; advanced pastes verbatim; edit label-only omits url |
| 9 | `DatabaseManager` + `ConnectionCard` + `engineMeta` | `DatabaseManager.test.tsx` (5 fail) | 5 passed | loads via API, active badge, add modal, activate + reload, delete |
| 10 | `AdminLayout` `databases` view | new view test | 6 passed (file) | Databases tab switches to the DatabaseManager view |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Stored active connection overrides `L1BR3_DB_PATH` for the engine | `tests/test_db_engine.py::TestRegistryStorePrecedence` | unit | PASS |
| 2 | `L1BR3_DATABASE_URL` env wins over the store | same class | unit | PASS |
| 3 | `reload_active_engine()` rebuilds from current store | same class | unit | PASS |
| 4 | Config file written 0600, atomic (no `.tmp` left) | `tests/test_connection_store.py::TestPersistence` | unit | PASS |
| 5 | Malformed config file never crashes boot (→ seeded default) | `tests/test_connection_store.py::TestPersistence` | unit | PASS |
| 6 | `POST /api/v1/databases/test` error never contains the password | `tests/test_database_routes.py::TestRouteTest` | integration | PASS |
| 7 | `DatabaseConnectionRead` never serializes `url` or `password` | `tests/test_database_routes.py::TestReadSchemaNeverLeaksSecrets` | unit | PASS |
| 8 | Create response body never contains the request password | `tests/test_database_routes.py::TestRouteCrud::test_create_returns_read_without_secret` | integration | PASS |
| 9 | Activate leaves the active connection unchanged on any failure | `tests/test_db_connection_service.py::TestActivate` | unit | PASS |
| 10 | Activating a postgresql url raises an actionable error (M2 not landed) | `tests/test_db_engine.py::...::test_postgres_active_url_raises_actionable_error` | unit | PASS |
| 11 | Zero-config: no env + no file → seeded default SQLite, active | `tests/test_connection_store.py::TestSeed` + registry fallback | unit | PASS |
| 12 | Guided form builds a credential-URL-encoded connection string | `components/databases/connectionUrl.test.ts` | unit | PASS |
| 13 | Databases admin view renders the DatabaseManager on tab click | `components/AdminLayout.test.tsx` | component | PASS |

## Validation commands actually run

```bash
# Backend
cd api && uv run pytest                                                  # 259 passed
cd api && uv run ruff check <new files>                                  # All checks passed
cd api && uv run mypy <new files>                                        # clean (see known gaps)
# Frontend
cd browser-ext && pnpm test                                              # 142 passed
cd browser-ext && npx tsc --noEmit                                       # clean
cd browser-ext && npx eslint components/databases/ ...                   # 0 errors (style warnings match repo)
cd browser-ext && npx prettier --check components/databases/ ...         # All matched files use Prettier code style
```

New tests added: **66 backend** (19 store + 10 redact + 23 routes + 9 service + 5 registry) and
**26 frontend** (8 api + 8 url + 4 modal + 5 manager + 1 admin view).

## Coverage and known gaps

- **New code is covered** by focused unit + integration tests; the credential-leak
  invariant is asserted at both schema and route layers.
- **Pre-existing issues NOT introduced by M3** (flagged, out of scope):
  - `api/app/schemas/envelope.py` and `api/app/routes/mcp.py` carry 3 pre-existing
    `mypy --strict` errors (committed files untouched by M3).
  - `api/app/db/base.py`, `app/repositories/prompt_repo.py`, and others carry
    pre-existing ruff `UP017` (`timezone.utc`) drift; `lib/api.ts` has 2 pre-existing
    eslint errors (`while (true)`, `!= null`). None are in M3's new/changed code.
- **M2 dependency (deferred integration)**: activating a PostgreSQL target is wired
  but raises an actionable "PostgreSQL engine not available (M2)" error until M2's
  `PostgresEngine` + registry dialect branch land. The test-connection path itself is
  engine-agnostic and works today; only persistent PG *activation* is gated. This
  mirrors M2's own `L1BR3_PG_TEST_URL` skip idiom.
- **Client-side "Test" on a stored connection**: the read shape has no raw url
  client-side, so the card's Test button surfaces a lightweight stored state; the
  authoritative server-side test runs as part of `activate`. A dedicated per-id
  server test endpoint can follow if desired.
- **Encryption deferred (M5)**: DB credentials live in plaintext inside the 0600
  `databases.json` file by design for the M3 functional MVP; M5 retrofits
  `app.services.security.crypto` onto the credential-bearing URL.
