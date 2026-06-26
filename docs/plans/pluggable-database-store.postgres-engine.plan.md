# Plan: Pluggable Database Store — PostgreSQL Engine (Milestone 2)

**Source PRD**: `docs/prds/pluggable-database-store.prd.md`
**Selected Milestone**: #2 — PostgreSQL engine (second concrete impl; search-index fallback for FTS5)
**Complexity**: Large

## Summary

Add a second `DatabaseEngine` impl — `PostgresEngine` — plus a `_PostgresTsVectorSearch`
`SearchBackend` so a user can point `L1BR3_DATABASE_URL` at a `postgresql://` URL and read/write
the same schema (prompts/tags/categories/transform-modes/search) they had under SQLite. The
registry branches on URL dialect (`postgresql*` → Postgres, else SQLite); SQLite remains the
zero-config default and its FTS5 path is untouched. This milestone delivers **the engine +
search parity** only — no settings UI (M3) and no data-migration wizard (M4).

## Decisions on PRD Open Questions (locked for this plan)

| OQ | Decision for M2 | Rationale |
|---|---|---|
| #56 Connection-test UX | **Deferred (M3)** | M2 ships no connection form; `ConnectionTest` from M1 is exercised only as a programmatic seam |
| #57 Rollback semantics | **Deferred (M4)** | No data migration in M2; engine switch is opt-in by env only (empty DBs expected) |

## Scope lock (what is / isn't in M2)

**In scope**
- `PostgresEngine` concrete impl + `_PostgresTsVectorSearch`.
- Registry dialect dispatch (`postgresql*` → Postgres, else SQLite via existing path).
- tsvector search-index DDL via a new Alembic revision, guarded by `dialect.name == "postgresql"`.
- `psycopg` (v3) driver dependency; connection-pool args tuned for Postgres.
- Search-parity validation harness (integration, PG-gated) comparing tsvector vs FTS5 recall.

**Out of scope (explicitly deferred)**
- Settings UI / connection form / "paste connection string" mode → **M3**.
- Migration wizard / data copy from SQLite → Postgres → **M4**.
- Encrypted credential storage → **M5** (follow-up). Credentials in M2 come from
  `L1BR3_DATABASE_URL` (env) only — same exposure surface as today, no regression.
- MySQL, in-browser wa-sqlite, multi-write replication → PRD-level out-of-scope.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Concrete engine shape | `api/app/db/engines/sqlite.py:82-124` | Class takes a resolved URL; builds `engine` + `SessionLocal`; owns a nested `_Search` impl; exposes `from_env()` doing env precedence |
| Constructor kwargs | `api/app/db/engines/sqlite.py:89-100` | `connect_args`/`echo`/optional `poolclass`; mirror with Postgres-appropriate `pool_pre_ping=True`, sane `pool_size` |
| Registry dispatch | `api/app/db/engines/registry.py:14-19` | Cached singleton built on first access; branch on dialect here |
| SearchBackend Protocol | `api/app/db/engines/base.py:24-38` | `init`/`search_prompts`/`drop` — implement all three; `search_prompts(db, query) -> list[str]` returns prompt IDs ordered by relevance (same contract as `_SqliteFtsSearch`) |
| Repository call site | `api/app/repositories/prompt_repo.py:30-34` | `get_active_engine().search.search_prompts(self.db, search)` — **unchanged**; the seam absorbs the dialect switch |
| Alembic env URL injection | `api/migrations/env.py:7-12` | Already reads `get_active_engine().url`; no change for M2 |
| Test layout | `api/tests/test_db_engine.py` | One test module per concern (`test_db_engine.py` for SQLite); add `test_db_engine_postgres.py` mirroring its class structure |
| Conftest engine override | `api/tests/conftest.py:22-41` | `set_active_engine()` per-test; the PG equivalent needs its own fixture, gated on `L1BR3_PG_TEST_URL` |
| Conditional migration DDL | `api/migrations/versions/001_initial.py:49-81` | FTS5 block is SQLite-only; mirror the **guard** idiom in a new revision using `op.get_bind().dialect.name` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `api/pyproject.toml` | UPDATE | Add `psycopg[binary]>=3.2` to runtime deps |
| `api/app/db/engines/postgres.py` | CREATE | `PostgresEngine` + `_PostgresTsVectorSearch` |
| `api/app/db/engines/registry.py` | UPDATE | Branch on URL dialect: `url.startswith("postgresql")` → `PostgresEngine`, else `SqliteEngine` |
| `api/app/db/engines/__init__.py` | UPDATE | Re-export `PostgresEngine` for import-parity with `SqliteEngine` |
| `api/migrations/versions/005_postgres_tsvector.py` | CREATE | New revision `005`, `down_revision="004"`. Guarded tsvector generated column + GIN index + (optional) trigger; no-op when `dialect.name != "postgresql"`. `downgrade()` drops them, also guarded |
| `api/tests/test_db_engine_postgres.py` | CREATE | Unit tests (URL parsing, dialect tag, SQL construction, protocol conformance) — always run; integration tests gated on `L1BR3_PG_TEST_URL` |
| `api/tests/test_prompt_search_postgres.py` | CREATE | Integration: tsvector `search_prompts` returns expected IDs + ordering — skipped without `L1BR3_PG_TEST_URL` |
| `api/tests/test_search_parity.py` | CREATE | Integration: same fixture corpus through FTS5 and tsvector; assert recall ≥ PRD target (parity threshold documented inline) — skipped without `L1BR3_PG_TEST_URL` |
| `api/tests/conftest.py` | UPDATE | Add `pg_session` fixture gated on `L1BR3_PG_TEST_URL`; existing `db`/`client` SQLite fixtures unchanged |
| `docs/testing/pluggable-database-store.postgres-engine.tdd.md` | CREATE | TDD evidence artifact (mirrors the M1 tdd doc) |

## Search Index Design (decision)

Postgres 12+ supports **stored generated tsvector columns** — the simplest parity for FTS5's
auto-maintained index:

```sql
-- migration 005 (postgresql only)
ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,   '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_prompts_search_tsv ON prompts USING GIN (search_tsv);
```

Rationale vs a trigger-based mirror:
- **Generated column** = zero trigger code; the DB keeps `search_tsv` in sync atomically (closer
  to FTS5's "external content" auto-sync than hand-rolled triggers).
- **`setweight`** lets title matches rank above body matches (FTS5 `bm25`-ish ranking is
  approximated via `ts_rank_cd` ordering at query time).
- **`'simple'`** dictionary (not `'english'`) for parity with SQLite FTS5's default tokenizer,
  which does no stemming. Parity harness (Task 7) confirms recall; if recall drifts we flip to
  `'english'` and re-measure — documented as the single tuning knob.

Query (`search_prompts`):
```sql
SELECT id FROM prompts
WHERE search_tsv @@ plainto_tsquery('simple', :q)
ORDER BY ts_rank_cd(search_tsv, plainto_tsquery('simple', :q)) DESC
```

`plainto_tsquery` (not `to_tsquery`) mirrors FTS5's tolerance of unquoted user input — no
syntax-error bombs on stray punctuation.

## Tasks

### Task 1: Add `psycopg` dependency
- **Action**: Add `psycopg[binary]>=3.2` to `[project].dependencies` in `api/pyproject.toml`;
  `uv lock` to refresh. Verify `uv run python -c "import psycopg; print(psycopg.__version__)"`.
- **Mirror**: existing dep block style (`api/pyproject.toml:7-17`).
- **Validate**: `cd api && uv sync && uv run python -c "import psycopg"`.

### Task 2: `_PostgresTsVectorSearch` + SQL construction (RED→GREEN)
- **Action**: Create `db/engines/postgres.py` with:
  - `_PostgresTsVectorSearch` class implementing `SearchBackend` Protocol.
  - Module-level DDL/query strings (`_TSV_COLUMN_DDL`, `_TSV_GIN_DDL`, `_SEARCH_SQL`, `_DROP_DDL`) —
    **parameterize the dictionary (`'simple'`)** as a module constant so parity-tuning is one line.
  - `init()` runs the two DDL statements; `search_prompts()` runs the ranked query returning IDs;
    `drop()` drops the index + column, all idempotent (`IF EXISTS`).
- **Mirror**: `sqlite.py:62-80` (`_SqliteFtsSearch`) for structure; `sqlite.py:23-59` for module-level SQL strings.
- **Validate**: `cd api && uv run pytest tests/test_db_engine_postgres.py -k "search_sql or protocol"` (unit tests on SQL string construction — no live DB needed).

### Task 3: `PostgresEngine` concrete impl (RED→GREEN)
- **Action**: In the same module, add `PostgresEngine`:
  - `__init__(url, *, poolclass=None)`: `create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10, echo=<same env flag>)`; `SessionLocal` bound; `self.search = _PostgresTsVectorSearch()`; `self.dialect = "postgresql"`.
  - `init_schema(connection)`: **no-op** (schema is Alembic's job; mirror `SqliteEngine.init_schema`).
  - `get_db()`: identical generator to SQLite.
  - `from_env()`: read `L1BR3_DATABASE_URL`; if missing or non-postgres, raise `ValueError("PostgresEngine requires L1BR3_DATABASE_URL=postgresql://…")` with an actionable message (mirror `factory.py` error style).
- **Mirror**: `sqlite.py:82-124` for class shape; `services/ai/factory.py` for actionable errors.
- **Validate**: `cd api && uv run pytest tests/test_db_engine_postgres.py -k "PostgresEngine"` (unit: URL stored, dialect tag, protocol conformance, `from_env` error path).

### Task 4: Registry dialect dispatch (RED→GREEN)
- **Action**: Update `registry.get_active_engine()`:
  - Read `L1BR3_DATABASE_URL`; if set and `startswith("postgresql")`, build `PostgresEngine(url)`.
  - Else fall through to existing `SqliteEngine.from_env()` (preserves zero-config default + `L1BR3_DB_PATH`).
- **Mirror**: existing `registry.py:14-19`; branching reads the same env var (no new env).
- **Validate**: `cd api && uv run pytest tests/test_db_engine_postgres.py::TestRegistryDispatch` (monkeypatch `L1BR3_DATABASE_URL`, assert `isinstance(get_active_engine(), PostgresEngine)`; clear env → SQLite). Reset singleton in each test.

### Task 5: tsvector migration (revision 005)
- **Action**: `cd api && uv run alembic revision -m "postgres tsvector search index"` → edit to `005_postgres_tsvector.py`:
  - `upgrade()`: guard `bind = op.get_bind(); if bind.dialect.name == "postgresql":` then `op.execute(_TSV_COLUMN_DDL); op.execute(_TSV_GIN_DDL)`. Reuse the **exact** SQL strings from `postgres.py` (import from the engine module to keep one source of truth — or duplicate into the migration if import cycles bite; prefer import).
  - `downgrade()`: guarded drop of index then column.
  - **Idempotent** (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) so re-runs are safe.
- **Mirror**: `001_initial.py:49-81` for FTS5-DDL-within-migration idiom; add the dialect guard (new pattern — there is no prior guarded migration; document inline why).
- **Validate**:
  - SQLite unaffected: `cd api && L1BR3_TESTING= uv run alembic upgrade head` against `sqlite:////tmp/m2_sqlite.db` → migration applies as no-op; `prompts_fts` still present (FTS5 unchanged).
  - Postgres (integration, gated): `cd api && L1BR3_DATABASE_URL="$L1BR3_PG_TEST_URL" uv run alembic upgrade head` → `\d prompts` shows `search_tsv` + `idx_prompts_search_tsv`.

### Task 6: Conftest PG fixtures
- **Action**: Add to `conftest.py`:
  - `_PG_URL = os.environ.get("L1BR3_PG_TEST_URL")`.
  - `pg_engine` session-scoped fixture: if `_PG_URL` is None, `pytest.skip("set L1BR3_PG_TEST_URL to run Postgres integration tests")`; else build `PostgresEngine(_PG_URL)`, `Base.metadata.create_all`, `search.init`, yield, then `search.drop` + `Base.metadata.drop_all` + `set_active_engine(None)`.
  - `pg_session` function-scoped fixture wrapping `pg_engine` with a per-test transaction-rollback (so tests don't pollute each other).
  - Existing `db`/`client` SQLite fixtures **untouched** — default `uv run pytest` stays SQLite-only.
- **Mirror**: existing `db` fixture (`conftest.py:22-41`) for shape; the skip-without-env idiom is new — document inline.
- **Validate**: `cd api && uv run pytest tests/test_db_engine_postgres.py -k integration` (skips cleanly without env); with env set, integration tests run.

### Task 7: Search-parity harness (RED→GREEN, integration)
- **Action**: `tests/test_search_parity.py`:
  - Seed an identical corpus (≥20 prompts spanning exact-substring, multi-word, title-only, content-only, no-match, punctuation) into both an in-memory SQLite engine and the `pg_session` fixture.
  - For each query in a fixture list, capture `sqlite.search.search_prompts` IDs (set) and `pg.search.search_prompts` IDs (set).
  - Assert **recall ≥ 95%** in either direction (threshold chosen to tolerate ranking-order differences; document it as the PRD's "<1% migration failures" analogue for search). Assert **zero false negatives on exact-substring queries** (hard parity for the high-confidence subset).
- **Mirror**: AAA pattern from `common/testing.md`; `test_db_engine.py::TestSqliteEngine::test_search_search_prompts_returns_ids` for seeding style.
- **Validate**: `cd api && L1BR3_PG_TEST_URL=postgresql://… uv run pytest tests/test_search_parity.py`.

### Task 8: TDD evidence doc
- **Action**: Write `docs/testing/pluggable-database-store.postgres-engine.tdd.md` mirroring the M1 evidence structure: task table (RED/GREEN per task), test-spec table, coverage report, acceptance checklist, known gaps.
- **Mirror**: `docs/testing/pluggable-database-store.engine-abstraction.tdd.md`.
- **Validate**: manual review against the actual test run output.

## Validation

```bash
# Default gate (SQLite only — must stay green, zero regressions)
cd api && uv run pytest
cd api && uv run ruff check .
cd api && uv run ruff format --check .
cd api && uv run mypy app

# Focused new unit tests (no Postgres required)
cd api && uv run pytest tests/test_db_engine_postgres.py -k "not integration"

# Postgres integration suite (requires a live PG; skip otherwise)
export L1BR3_PG_TEST_URL="postgresql://l1br3:l1br3@localhost:5432/l1br3_m2_test"
cd api && uv run pytest tests/test_db_engine_postgres.py tests/test_prompt_search_postgres.py tests/test_search_parity.py

# Migration parity: SQLite unaffected
cd api && L1BR3_DB_PATH=/tmp/m2_sqlite.db uv run alembic upgrade head
#   → confirm prompts_fts + 3 triggers present (FTS5 path unchanged)

# Migration parity: Postgres gets tsvector
cd api && L1BR3_DATABASE_URL="$L1BR3_PG_TEST_URL" uv run alembic upgrade head
#   → \d prompts shows search_tsv generated column + idx_prompts_search_tsv

# Registry dispatch smoke
cd api && L1BR3_DATABASE_URL="postgresql://x/y" uv run python -c \
  "from app.db.engines.registry import get_active_engine; print(type(get_active_engine()).__name__)"
#   → PostgresEngine
cd api && uv run python -c \
  "from app.db.engines.registry import get_active_engine; print(type(get_active_engine()).__name__)"
#   → SqliteEngine  (zero-config default preserved)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| FTS5 ↔ tsvector recall drift (tokenizer/dictionary differences) | High | Task 7 parity harness with a documented threshold; `'simple'` dictionary chosen for tokenizer parity; one-line knob to flip to `'english'` if recall regresses |
| Migrations 001–004 contain SQLite-isms (FTS5, `INTEGER` booleans) that break on Postgres | High | Audit each existing revision against Postgres before Task 5; add `005` as the postgres-search carrier and patch prior revisions with dialect guards **only if** they fail — surface findings, don't silently fork the chain |
| Postgres integration tests unrunnable in dev (no docker) | Medium | All PG tests `pytest.skip` without `L1BR3_PG_TEST_URL`; unit tests (SQL construction, registry dispatch, protocol conformance) run in the default gate |
| `psycopg[binary]` conflicts with PyInstaller build (`api/build.sh`) | Medium | Run `just build` post-Task 1; if binary wheels bloat/break the frozen exe, switch to `psycopg` (source) with a build-time `libpq-dev` pin — documented fallback |
| Import cycle: `migrations/005` imports DDL from `app.db.engines.postgres` | Medium | Keep `postgres.py` DDL strings at module top-level with **no** model imports; if cycle still bites, duplicate the two SQL strings into the migration with a `# keep in sync with app.db.engines.postgres` comment |
| Generated tsvector column not supported on target PG version (<12) | Low | Require PG ≥ 14 in README (current LTS); document the version floor. If pre-12 support is ever needed, fall back to trigger-based mirror of `_SqliteFtsSearch` |
| Silent ranking-order regression misread as data loss | Medium | Parity harness asserts on **ID sets** (recall), not ordering; ranking parity is a separate, softer assertion |

## Acceptance

- [ ] All tasks complete
- [ ] `uv run pytest` green on the default SQLite gate — zero regressions vs M1
- [ ] `ruff check` / `ruff format --check` / `mypy app` clean on new + changed files
- [ ] `PostgresEngine` satisfies `DatabaseEngine`; `_PostgresTsVectorSearch` satisfies `SearchBackend` (runtime `isinstance` checks)
- [ ] Registry dispatch: `postgresql://` → PostgresEngine; absent/non-postgres URL → SqliteEngine (zero-config default preserved)
- [ ] `alembic upgrade head` is a no-op for SQLite and adds `search_tsv` + GIN index for Postgres
- [ ] Search-parity harness passes (recall ≥ 95% both directions; 100% on exact-substring queries) when run against a live PG
- [ ] Repository contains **no** dialect-specific SQL — `PromptRepository.find_all` unchanged from M1 (search fully absorbed by the seam)
- [ ] TDD evidence doc written; PRD milestone #2 row updated: `pending` → `in-progress`, Plan cell set to this artifact's path

---
*Next: Milestone 3 (Database Manager UI) — re-run `/plan docs/prds/pluggable-database-store.prd.md` once this plan ships.*
