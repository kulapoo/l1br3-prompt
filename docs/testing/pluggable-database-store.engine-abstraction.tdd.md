# TDD Evidence — Pluggable Database Store: Engine Abstraction (M1)

**Source plan**: `docs/plans/pluggable-database-store.engine-abstraction.plan.md`
**Approach**: strict RED → GREEN → REFACTOR per task, with checkpoint commits.

## User journeys (from plan)

1. As the app maintainer, I want DB access to flow through a single `DatabaseEngine`
   interface, so that a Postgres/tsvector impl can drop in later without touching
   callers (M1 introduces the seam; default behavior is bit-for-bit preserved).
2. As an operator, I want `L1BR3_DATABASE_URL` to override `L1BR3_DB_PATH` to
   override the zero-config `~/.l1br3/l1br3.db` default, so I can point the app at
   any SQLAlchemy URL without code changes.
3. As a test author, I want to override the active engine per-test, so tests run
   against an isolated in-memory SQLite without leaking state.

## Task report

| # | Task | RED evidence | GREEN evidence |
|---|------|--------------|----------------|
| 1 | Define Protocols (`base.py`) | `pytest tests/test_db_engine.py` → `ModuleNotFoundError: app.db.engines` (collection error) | `TestProtocols` 4/4 pass |
| 2 | `SqliteEngine` concrete impl | same RED as Task 1 (module absent) | `TestSqliteEngine` 10/10 pass |
| 3 | Registry + `engine.py` shim | same RED as Task 1 | `TestRegistry` 3/3 + `TestShimReExports` 1/1 pass; full suite (187) green |
| 4 | Repository search delegation | `test_find_all_delegates_search_to_backend` + `test_repository_has_no_inline_fts_sql` failed (inline FTS still present) | `tests/test_prompt_search.py` 4/4 pass; existing search tests unchanged |
| 5 | Wire Alembic `env.py` | n/a (wiring; GREEN gate = migration smoke) | `alembic upgrade head` on fresh DB → `prompts_fts` + 3 triggers present |
| 6 | `conftest` via `set_active_engine` | covered by Task 4's regression suite | full suite (191→192) green |

### Commands actually run

```bash
cd api && uv run pytest tests/test_db_engine.py            # Task 1-3
cd api && uv run pytest tests/test_prompt_search.py         # Task 4
cd api && uv run pytest                                      # full gate (192 passed)
cd api && uv run mypy app/db/engines                         # Success: no issues
cd api && uv run ruff check app/db/engines tests/test_db_engine.py tests/test_prompt_search.py tests/conftest.py  # All checks passed
cd api && uv run ruff format --check <new files>            # already formatted
cd api && L1BR3_DB_PATH=/tmp/l1br3_smoke.db uv run alembic upgrade head   # FTS5 table+triggers created
cd api && L1BR3_DATABASE_URL="sqlite:////tmp/l1br3_url.db" uv run python -c "..."  # precedence confirmed
```

## Test specification (guarantees)

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `SqliteEngine` satisfies `DatabaseEngine` Protocol (`isinstance` runtime check) | `tests/test_db_engine.py::TestProtocols::test_database_engine_is_runtime_checkable` | unit | PASS |
| 2 | `SqliteEngine.search` satisfies `SearchBackend` Protocol | `test_search_backend_is_runtime_checkable` | unit | PASS |
| 3 | `ConnectionTest` is frozen (immutable) | `test_connection_test_frozen` | unit | PASS |
| 4 | `L1BR3_DATABASE_URL` overrides `L1BR3_DB_PATH` overrides default | `from_env_*` x3 | unit | PASS |
| 5 | FTS init creates `prompts_fts` + `prompts_ai/ad/au` triggers | `test_search_init_creates_fts_table` | integration | PASS |
| 6 | `search.search_prompts` returns prompt IDs ordered by rank | `test_search_search_prompts_returns_ids` | integration | PASS |
| 7 | `get_active_engine()` returns a cached singleton; `set_active_engine` overrides | `TestRegistry` x3 | unit | PASS |
| 8 | `app.db.engine` shim re-exports all legacy names | `TestShimReExports` | unit | PASS |
| 9 | `PromptRepository.find_all(search=)` delegates to `SearchBackend.search_prompts` | `test_find_all_delegates_search_to_backend` | integration | PASS |
| 10 | `PromptRepository` contains **no** dialect-specific SQL (`prompts_fts`/`MATCH`/`fts5` absent) | `test_repository_has_no_inline_fts_sql` + runtime probe | unit | PASS |
| 11 | Fresh-DB migration creates the FTS5 virtual table + 3 triggers | manual smoke (alembic upgrade head) | integration | PASS |

## Coverage

`coverage run --source=app/db/engines` → **100%** (87/87 statements) across
`base.py`, `sqlite.py`, `registry.py`, `__init__.py`. Exceeds the 80% minimum.

## Acceptance checklist (from plan)

- [x] All tasks complete
- [x] `uv run pytest` green — **192 passed** (168 baseline + 24 new), zero regressions
- [x] `ruff check` / `ruff format --check` clean on all new/changed files
- [x] `mypy app/db/engines` clean (0 errors). 5 pre-existing mypy errors remain in
      untouched files (`envelope.py`, `cloud.py`, `routes/ai.py`, `routes/mcp.py`) —
      **not introduced by this milestone**
- [x] Zero-config preserved — no-env smoke boots with `sqlite:////home/.../.l1br3/l1br3.db`
- [x] Precedence verified: `L1BR3_DATABASE_URL` > `L1BR3_DB_PATH` > default
- [x] `PromptRepository` has no dialect-specific SQL (probed at runtime)
- [x] `db/engine.py` is a pure shim; new code lives in `db/engines/`
- [ ] PRD milestone #1 row status update — out of scope for code TDD; update in PRD file separately

## Known gaps / follow-ups

- **mypy `--strict` on whole `app/`**: 5 pre-existing errors predate this work and
  are intentionally left for a separate cleanup pass (not in M1 scope).
- **`ConnectionTest`**: defined now as the M3 seam; not yet exercised by a real
  connection-test flow (no connection form exists until M3).
- Postgres/tsvector engine is **M2** — the `SearchBackend` Protocol is ready for it.

## Merge evidence (RED/GREEN/refactor summary, in case of squash)

- RED commit: `test(api): add RED tests for engine abstraction (M1)` — all 19 fail (module absent)
- GREEN commit: `feat(api): add pluggable engine abstraction ... (M1 tasks 1-3)` — 19 new + 187 full pass
- GREEN commit: `refactor(api): delegate prompt search to SearchBackend (task 4)` — repo has no dialect SQL
- GREEN commit: `refactor(api): wire alembic env.py ... (task 5)` — migration smoke verified FTS5
- GREEN commit: `refactor(api): conftest uses set_active_engine ... (task 6)` — full suite 191 pass
- REFACTOR commit: `refactor(api): type-clean engine abstraction` — mypy/ruff clean on new code
- COVERAGE commit: `test(api): cover SqliteEngine.init_schema` — 100% on engines pkg
