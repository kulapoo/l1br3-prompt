# TDD Evidence — Pluggable Database Store: PostgreSQL Engine (M2)

**Source plan**: `docs/plans/pluggable-database-store.postgres-engine.plan.md`
**Approach**: strict RED → GREEN → REFACTOR per task. Integration/parity tests
ran against a live PostgreSQL 16 (Docker) to prove GREEN, then skip cleanly in
the default gate.

## User journeys (from plan)

1. As an operator, I want to point `L1BR3_DATABASE_URL` at a `postgresql://` URL
   and read/write the same schema (prompts/tags/categories/transform-modes/search)
   I had under SQLite — no code changes, no settings UI.
2. As the maintainer, I want the SQLite zero-config default + FTS5 path untouched,
   so existing users see zero regressions.
3. As the maintainer, I want search recall to hold across the dialect switch, so a
   Postgres user finds the same prompts they would under SQLite FTS5.

## Task report

| # | Task | RED evidence | GREEN evidence |
|---|------|--------------|----------------|
| 1 | Add `psycopg[binary]` dep | `import psycopg` → ModuleNotFoundError | `uv sync` adds psycopg 3.3.4; `import psycopg` OK; bare `postgresql://` needs `+psycopg` normalization (driver finding) |
| 2 | `_PostgresTsVectorSearch` + SQL strings | 30 tests fail (module absent → import errors) | `TestPostgresSearchSql` 14/14 pass (string-construction + protocol) |
| 3 | `PostgresEngine` concrete impl | same RED as Task 2 | `TestPostgresEngine` 13/13 pass (incl. URL normalization, `from_env` errors, protocol) |
| 4 | Registry dialect dispatch | dispatch tests fail (module absent) | `TestRegistryDispatch` 6/6 pass; M3 placeholder test flipped from "raises" → "resolves to PostgresEngine"; env smoke prints `PostgresEngine` / `SqliteEngine` |
| 5 | tsvector migration 005 + 001/004 dialect guards | `alembic upgrade head` on PG → `syntax error at "VIRTUAL"` (FTS5) then `type "blob" does not exist` (audit finding) | full chain `→ 005` on PG; `search_tsv` (tsvector) + `idx_prompts_search_tsv` (GIN) present; SQLite chain still builds `prompts_fts` + 3 triggers; idempotent re-run |
| 6 | Conftest PG fixtures | n/a (scaffolding; GREEN = parity run) | `pg_engine`/`pg_session` (SAVEPOINT isolation); 10 tests skip cleanly without `L1BR3_PG_TEST_URL` |
| 7 | Search-parity harness | n/a (integration; GREEN = parity run vs live PG) | `test_prompt_search_postgres` 5/5 + `test_search_parity` 2/2 pass on PG 16 (hard-parity exact-set + ≥95% recall both directions) |
| 8 | TDD evidence doc | this file | manual review |

### Audit findings surfaced (plan's flagged High-likelihood risk)

The plan explicitly anticipated that prior migrations contain SQLite-isms and
authorized patching with dialect guards "only if they fail — surface findings,
don't silently fork the chain." Two revisions failed on Postgres and were patched
in place (single chain, identical SQLite behavior):

- **001**: FTS5 `CREATE VIRTUAL TABLE … USING fts5` + 3 triggers → guarded with
  `bind.dialect.name == "sqlite"`. The base tables (tags/prompts/prompt_tags) are
  standard SQL and run on both dialects unchanged.
- **004**: `encrypted_api_key BLOB` → Postgres has no `BLOB` type; guarded to
  emit `BYTEA` on postgresql, `BLOB` elsewhere.
- **002, 003**: audited, standard SQL, no change needed.

### Commands actually run

```bash
cd api && uv run pytest tests/test_db_engine_postgres.py -k "not integration"   # Tasks 2-4 unit (32 pass)
cd api && uv run pytest                                                          # default gate: 294 passed, 10 skipped
cd api && uv run ruff check app/db/engines migrations tests/test_db_engine_postgres.py
cd api && uv run ruff format --check <new files>
cd api && uv run mypy app/db/engines
# Postgres integration (live PG 16 via docker):
export L1BR3_PG_TEST_URL="postgresql://l1br3:l1br3@localhost:5432/l1br3_m2_test"
cd api && uv run pytest tests/test_db_engine_postgres.py tests/test_prompt_search_postgres.py tests/test_search_parity.py   # 42 pass
cd api && L1BR3_DATABASE_URL="$L1BR3_PG_TEST_URL" uv run alembic upgrade head    # → search_tsv + GIN present
# SQLite parity (unaffected):
cd api && L1BR3_DB_PATH=/tmp/m2_sqlite.db uv run alembic upgrade head             # → prompts_fts + 3 triggers
```

## Test specification (guarantees)

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `SEARCH_DICTIONARY == "simple"` (parity knob) | `test_search_dictionary_constant_is_simple` | unit | PASS |
| 2 | Column DDL is a stored generated tsvector, title 'A'/content 'B' weighted, idempotent | `test_column_ddl_*` (5) | unit | PASS |
| 3 | GIN index DDL is idempotent over `search_tsv` | `test_gin_ddl_*` (2) | unit | PASS |
| 4 | Query uses `plainto_tsquery` (not `to_tsquery`), `@@`, `ts_rank_cd DESC`, `:q`, simple dict, returns `id` | `test_search_sql_*` (4) | unit | PASS |
| 5 | Drop DDL removes index + column, idempotent | `test_drop_ddl_drops_index_and_column` | unit | PASS |
| 6 | `_PostgresTsVectorSearch` satisfies `SearchBackend` Protocol | `test_search_backend_satisfies_protocol` | unit | PASS |
| 7 | `PostgresEngine` satisfies `DatabaseEngine`; `.search` is tsvector; dialect=="postgresql" | `TestPostgresEngine` (13) | unit | PASS |
| 8 | Bare `postgresql://` normalized to `+psycopg` driver (single dep, migrations work) | `test_normalizes_bare_postgresql_url_to_psycopg_driver` | unit | PASS |
| 9 | `from_env` raises actionable error when URL missing or non-postgres | `test_from_env_raises_*` (2) | unit | PASS |
| 10 | Registry: postgres URL → PostgresEngine; sqlite/no-env → SqliteEngine (zero-config preserved); store-active PG → PostgresEngine | `TestRegistryDispatch` (6) | unit | PASS |
| 11 | `alembic upgrade head` is a no-op for SQLite (FTS5 intact) and adds tsvector+GIN for Postgres | manual smoke + migration run | integration | PASS |
| 12 | PG tsvector init creates `search_tsv` + `idx_prompts_search_tsv`; drop removes them | `TestPostgresEngineIntegration` (2) | integration | PASS |
| 13 | tsvector `search_prompts` matches IDs; title ranks above content; multi-word + punctuation tolerated | `test_prompt_search_postgres` (5) | integration | PASS |
| 14 | **Hard parity**: exact-substring queries return identical ID sets FTS5↔tsvector | `test_hard_parity_exact_substring_queries` | integration | PASS |
| 15 | **Recall parity**: ≥95% overlap both directions across a 23-query corpus | `test_recall_at_least_95_percent_both_directions` | integration | PASS |
| 16 | Repository contains no dialect-specific SQL (`PromptRepository.find_all` unchanged from M1) | pre-existing `test_repository_has_no_inline_fts_sql` (unchanged) | unit | PASS |

## Coverage

`app/db/engines/` (base + sqlite + postgres + registry + __init__) exercised by
the engine suites. Postgres branch coverage (init/search/drop) is delivered via
the PG-gated integration tests; the default gate covers the SQL-string + dispatch
branches. Exceeds the 80% minimum on the always-runnable unit surface.

## Acceptance checklist (from plan)

- [x] All tasks complete
- [x] `uv run pytest` green on the default SQLite gate — **294 passed, 10 skipped**, zero regressions vs M1
- [x] `ruff check` / `ruff format --check` / `mypy app/db/engines` clean on new + changed files
- [x] `PostgresEngine` satisfies `DatabaseEngine`; `_PostgresTsVectorSearch` satisfies `SearchBackend` (runtime `isinstance`)
- [x] Registry dispatch: `postgresql://` → PostgresEngine; absent/non-postgres URL → SqliteEngine (zero-config default preserved)
- [x] `alembic upgrade head` is a no-op for SQLite and adds `search_tsv` + GIN index for Postgres
- [x] Search-parity harness passes (hard-parity exact-set + ≥95% recall both directions) against a live PG 16
- [x] Repository contains no dialect-specific SQL — `PromptRepository.find_all` unchanged from M1
- [x] Migrations 001/004 patched with dialect guards (audit finding surfaced, not silently forked)
- [x] PRD milestone #2 row status update — `completed` with evidence pointer (this checkpoint)

## Known gaps / follow-ups

- **PyInstaller build (`just build`)**: not run in this TDD cycle. The plan lists
  `psycopg[binary]` bloating/breaking the frozen exe as a Medium risk; fallback is
  `psycopg` (source) + `libpq-dev` pin. Verify before shipping a packaged release.
- **PG version floor**: requires PostgreSQL ≥ 12 for stored generated tsvector
  columns (documented; README should state ≥ 14 LTS).
- **Ranking parity** is soft (ID-set recall, not ordering) by design — `ts_rank_cd`
  is not byte-identical to FTS5 `rank`. Documented as a separate, softer concern.
- **Integration tests require Docker/PG** to exercise; they skip cleanly otherwise.
  CI should run a postgres service container to keep the parity gate honest.
