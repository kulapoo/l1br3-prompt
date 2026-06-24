# Plan: Pluggable Database Store — Engine Abstraction (Milestone 1)

**Source PRD**: `docs/prds/pluggable-database-store.prd.md`
**Selected Milestone**: #1 — Engine abstraction (backend reads/writes through a common interface; SQLite impl behind it; default unchanged)
**Complexity**: Medium

## Summary

Introduce a `DatabaseEngine` Protocol + `SearchBackend` Protocol in `api/app/db/engines/`, move the current hardcoded SQLite behavior into a concrete `SqliteEngine` behind the protocol, and add a registry accessor so app startup, Alembic env, and tests share one source of truth. No Postgres, no UI, no migration wizard — this is a pure refactor that preserves today's zero-config SQLite default bit-for-bit while creating the seam M2 (Postgres/tsvector) plugs into.

## Decisions on PRD Open Questions (locked for this plan)

| OQ | Decision for M1 | Rationale |
|---|---|---|
| #56 Connection-test UX | **Deferred (M3)** | No connection form yet; M1 has no multi-engine selection surface |
| #57 Rollback semantics | **Deferred (M4)** | No data migration in M1 |

Config: add `L1BR3_DATABASE_URL` (any SQLAlchemy URL, takes precedence); keep `L1BR3_DB_PATH` as SQLite-only backward-compat default. Search: abstract now via `SearchBackend` Protocol. Layout: `db/engines/` subpackage mirroring `services/ai/`.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Protocol shape | `api/app/services/ai/provider.py:15-19` | `@runtime_checkable` Protocol; concrete classes duck-type, do NOT subclass |
| Factory/registry | `api/app/services/ai/factory.py:8-40` | Single resolver fn returning the active impl; raises with actionable message |
| Module-level singleton accessor | `api/app/db/engine.py:8-25` | Engine/SessionLocal built once at import; `get_db()` generator yields sessions |
| Pydantic-config-agnostic config | `api/app/main.py:17-23` | Read env at startup; `_run_migrations()` reads the engine's URL |
| Conftest FTS setup | `api/tests/conftest.py:26-72` | FTS5 virtual table + triggers built manually per-test (this stays, now via the SQLite backend's `init_search()`) |
| Alembic env URL injection | `api/migrations/env.py:7-12` | Imports URL from the db module and sets `sqlalchemy.url` on the config |

## Files to Change

| File | Action | Why |
|---|---|---|
| `api/app/db/engines/__init__.py` | CREATE | Re-export `DatabaseEngine`, `SearchBackend`, `get_active_engine` |
| `api/app/db/engines/base.py` | CREATE | `DatabaseEngine` + `SearchBackend` Protocols + dataclasses for connection result |
| `api/app/db/engines/sqlite.py` | CREATE | `SqliteEngine` — current behavior (URL from `L1BR3_DATABASE_URL`/`L1BR3_DB_PATH`/default; `check_same_thread=False`; FTS5 `init_search`/`search`) |
| `api/app/db/engines/registry.py` | CREATE | `get_active_engine()` — module-level cached singleton; env-driven selection (SQLite only in M1) |
| `api/app/db/engine.py` | **REWRITE AS SHIM** | Re-export `engine`, `SessionLocal`, `get_db`, `DATABASE_URL`, `get_active_engine`, `set_active_engine` from the registry — preserves every existing `from app.db.engine import ...` site |
| `api/app/repositories/prompt_repo.py` | UPDATE | `find_all` search branch delegates to `engine.search.search_prompts()` instead of inline FTS5 SQL |
| `api/app/main.py` | UPDATE (if needed) | `_run_migrations()` reads URL from `get_active_engine()` if the shim alone is insufficient |
| `api/migrations/env.py` | UPDATE | Pull URL from `get_active_engine().url` instead of module-global `DATABASE_URL` |
| `api/tests/conftest.py` | UPDATE | Override the active engine singleton per-test; SQLite backend owns FTS5 DDL via `init_search()` |
| `api/tests/test_db_engine.py` | CREATE | Unit tests: env precedence, default URL, search backend returns expected IDs |
| `api/tests/test_prompt_search.py` | CREATE | Search path through the new `SearchBackend` delegation (was previously implicit in repo tests) |

## Tasks

### Task 1: Define the Protocols (RED→GREEN)
- **Action**: Create `db/engines/base.py`:
  - `DatabaseEngine` Protocol: `url: str`, `engine: Engine`, `SessionLocal: sessionmaker`, `dialect: str`, `search: SearchBackend`, `init_schema(connection)` (no-op default), `get_db() -> Generator[Session]`.
  - `SearchBackend` Protocol: `init(connection)` (create FTS5 table + triggers / M2: tsvector), `search_prompts(db, query) -> list[str]` (returns prompt IDs), `drop(connection)` (for test teardown).
  - `@dataclass(frozen=True) ConnectionTest` with `ok: bool`, `error: str | None` (no secrets) — used by M3 but define now as the seam.
- **Mirror**: `services/ai/provider.py:15-19`.
- **Validate**: `cd api && uv run pytest tests/test_db_engine.py -k protocol` (write a `isinstance(x, DatabaseEngine)` runtime-check test first).

### Task 2: `SqliteEngine` concrete impl (RED→GREEN)
- **Action**: Create `db/engines/sqlite.py`. Constructor takes a resolved URL string. Builds `create_engine(url, connect_args={"check_same_thread": False}, echo=...)`. Owns a nested `_SqliteFtsSearch` implementing `SearchBackend` — `init()` runs the FTS5 virtual table + 3 triggers (moved verbatim from `conftest.py:27-54` / `migrations/versions/001_initial.py:50-81`); `search_prompts()` runs the `MATCH` query currently inlined at `prompt_repo.py:31-37`; `drop()` removes the FTS table. Provide a classmethod `from_env()` applying the `L1BR3_DATABASE_URL` > `L1BR3_DB_PATH` > `~/.l1br3/l1br3.db` precedence.
- **Mirror**: `db/engine.py:8-23` (exact connect args + echo flag), `conftest.py:27-54` (FTS DDL).
- **Validate**: `cd api && uv run pytest tests/test_db_engine.py -k sqlite`.

### Task 3: Registry + active-engine accessor (RED→GREEN)
- **Action**: Create `db/engines/registry.py` with `get_active_engine() -> DatabaseEngine` (module-level cached singleton, built on first call via `SqliteEngine.from_env()`) and `set_active_engine(engine)` (test override hook, M3 will use this to swap on user action). Rebuild `db/engine.py` as a thin shim re-exporting `engine`, `SessionLocal`, `get_db`, `DATABASE_URL`, `get_active_engine`, `set_active_engine` from the registry — preserves every existing `from app.db.engine import ...` site.
- **Mirror**: `services/ai/factory.py:8-40` (resolver returns one impl; raises actionable error), `db/engine.py:25-33` (`get_db` generator).
- **Validate**: `cd api && uv run pytest tests/test_db_engine.py -k registry`.

### Task 4: Repository search delegation (RED→GREEN)
- **Action**: In `prompt_repo.py:find_all`, replace the inline FTS5 `text(...)` block (lines 31-40) with `matched_ids = get_active_engine().search.search_prompts(self.db, search)`. Add a test asserting identical behavior against the existing search tests.
- **Mirror**: existing search tests in `tests/test_prompts.py` (assert exact same matched IDs returned).
- **Validate**: `cd api && uv run pytest tests/test_prompt_search.py tests/test_prompts.py -k search`.

### Task 5: Wire startup + Alembic (GREEN)
- **Action**: `main.py:_run_migrations()` — no change needed if env reads from the shim. Update `migrations/env.py:7-12` to read `get_active_engine().url` instead of the module-global `DATABASE_URL`. Confirm the SQLite engine still triggers FTS init — Alembic migration `001` already does it for fresh DBs; for tests `conftest` calls `init_search()`.
- **Mirror**: `migrations/env.py:7-12`.
- **Validate**: `cd api && L1BR3_TESTING= uv run alembic upgrade head` against a temp DB (manual smoke — migrations are skipped in tests).

### Task 6: Conftest + regression (GREEN)
- **Action**: Update `conftest.py` to override the active engine with an in-memory `SqliteEngine` per test via `set_active_engine()`, calling its `search.init()` instead of the standalone `_create_fts_and_triggers` helper (which becomes dead code — delete it). Confirm all existing tests stay green — `byok=None`-equivalent: no env set means SQLite default.
- **Mirror**: `conftest.py:26-72`.
- **Validate**: `cd api && uv run pytest`.

## Validation

```bash
# Focused, during TDD loops
cd api && uv run pytest tests/test_db_engine.py
cd api && uv run pytest tests/test_prompt_search.py
cd api && uv run pytest tests/test_prompts.py -k search

# Full gate (AGENTS.md: lint is incomplete, run these explicitly)
cd api && uv run pytest
cd api && uv run ruff check .
cd api && uv run ruff format --check .
cd api && uv run mypy app

# Default zero-config preserved: unset env, fresh DB, app boots + migrations run
cd api && L1BR3_DB_PATH=/tmp/l1br3_smoke.db uv run alembic upgrade head
# Verify FTS5 virtual table + triggers exist in the resulting file (sqlite3 CLI inspection)

# Config precedence smoke
cd api && L1BR3_DATABASE_URL="sqlite:////tmp/l1br3_url.db" uv run python -c "from app.db.engines.registry import get_active_engine; print(get_active_engine().url)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Import cycle: `engines/` imports models for type hints while models import `Base` from `db/base` | Medium | Keep Protocols in `base.py` free of model imports; use `Session`/`Engine` types only; `import app.models` only at runtime in `registry.py` |
| FTS DDL now lives in 3 places (migration 001, sqlite backend, old conftest helper) | Medium | Migration 001 stays authoritative for production fresh-DB; `SqliteEngine.search.init()` is the test/constraint path; delete the old conftest helper to collapse to 2 |
| Module-global `DATABASE_URL`/`engine` removed too eagerly breaks importers | Low | Keep `db/engine.py` as a re-export shim (Task 3) — no importer changes required |
| `set_active_engine()` mid-request leaks across tests | Medium | `conftest` uses function-scoped fixture + `set_active_engine(None)` reset in teardown |
| Silent behavior drift in search delegation | Low | Task 4 keeps the exact same SQL string, just relocated; existing search tests are the regression gate |

## Acceptance
- [ ] All tasks complete
- [ ] `uv run pytest` green (full existing suite — no regressions)
- [ ] `ruff check`, `ruff format --check`, `mypy app` clean
- [ ] Fresh install with no env vars works identically to today (zero-config preserved — smoke-checked)
- [ ] `L1BR3_DATABASE_URL` overrides `L1BR3_DB_PATH` overrides default (test asserts precedence)
- [ ] `PromptRepository` contains no dialect-specific SQL — all search goes through `SearchBackend`
- [ ] `db/engine.py` is a pure shim; new code lives in `db/engines/`
- [ ] PRD milestone #1 row updated: `pending` → `in-progress`, Plan cell set to the artifact path

---
*Next: Milestone 2 (PostgreSQL engine + tsvector search fallback) — re-run `/plan docs/prds/pluggable-database-store.prd.md` once this plan ships.*
