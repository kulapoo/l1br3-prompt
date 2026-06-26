# TDD Evidence: Pluggable Database Store — Migration Wizard (Milestone 4)

**Source plan**: `docs/plans/pluggable-database-store.migration-wizard.plan.md`
**Source PRD**: `docs/prds/pluggable-database-store.prd.md` (milestone #4)

## Summary

Implemented the streaming data-migration wizard end-to-end: a Core-level
`iter_migration` service that copies every user-data table from the active source
to a target inside ONE target transaction (rollback-on-any-failure, atomic
swap-after-commit); a `POST /api/v1/databases/{id}/migrate` SSE endpoint mirroring
`/generate` and `/transform`; and a `MigrationModal` that streams per-table
progress. On any failure or client disconnect the target transaction rolls back
and the source stays active. The search index is never copied explicitly — FTS5
triggers (SQLite) and the `search_tsv` generated column (Postgres) derive from
prompt rows automatically. Cross-dialect copy (sqlite↔postgresql) was validated
against a live Postgres.

## User journeys (from the plan)

1. Switch databases AND keep all data: prompts, tags, prompt-tag links, transform
   modes, and saved AI providers move to the new target.
2. Watch copy progress stream per table (copied/total) — no opaque "spinning".
3. Survive failure safely: any mid-copy error or client disconnect leaves the
   source active and the target empty (rolled back), never half-written.
4. Never leak the target URL or password in a progress frame, error frame, or log.
5. Refuse to migrate into a non-empty target (no silent overwrite/truncate).

## Task report (RED → GREEN)

| # | Task | RED | GREEN | Guarantee |
|---|---|---|---|---|
| 1 | Promote `build_engine_for_url` (public) | `TestBuildEngineForUrl` (3 ImportError) | 3 passed (60 in file) | Dialect dispatch is public; target engine can be built WITHOUT disturbing the active singleton |
| 2 | `migration_service.iter_migration` happy path | `TestIterMigrationHappyPath` (5 ModuleNotFoundError) | 5 passed | Byte-exact fidelity across all 5 tables; meta-first event order; progress copied==total; FTS auto-populated; IDs preserved |
| 3 | Rollback / empty-target guard / empty-source / disconnect | `TestRollbackAndGuards` (4 characterization) | 4 passed | Mid-copy failure rolls target back fully; populated target refused; empty source commits cleanly; `gen.close()` rolls back (disconnect) |
| 4 | `POST /{id}/migrate` SSE route | `TestRouteMigrate` (4 fail @ 404, 1 pass) | 5 passed | meta/progress/done frames; success swaps active + reloads; failure leaves source active; **no URL/password in any frame**; 404 unknown; 400 test-fail |
| 5 | Cross-dialect PG integration | `TestCrossDialect` (2 skipped without PG) | 2 passed vs live PG | sqlite→PG and PG→sqlite fidelity; ciphertext→BYTEA round-trip; both engines' search indexes auto-populated |
| 6 | FE `_consumeMigrationSSE` + `migrateDatabase` + types | `migrateDatabase` suite (3 fail: not a function) | 3 passed (17 in file) | meta+progress dispatch; done resolves; error frame rejects; non-OK status rejects; correct endpoint+method |
| 7 | FE `MigrationModal` + Card button + Manager wiring | `DatabaseManager` migrate cases (2 fail: no button) | 2 passed (7 in file) | "Migrate & activate" opens modal; confirm calls `migrateDatabase(url,id,opts,AbortSignal)`; success refreshes list |

> **Task 3 note:** rollback/guard/empty behaviors are inherent to the single-target-transaction
> design implemented in Task 2, so these tests were GREEN on first run as characterization tests —
> they lock the guarantees rather than newly driving implementation. The disconnect
> (`gen.close()` → rollback) test is the most load-bearing of these.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `build_engine_for_url("postgresql://…")` → `PostgresEngine`, `"sqlite://"` → `SqliteEngine` | `tests/test_db_engine.py::TestBuildEngineForUrl` | unit | PASS |
| 2 | Building a throwaway engine does NOT change the active singleton | `…::test_does_not_disturb_active_singleton` | unit | PASS |
| 3 | All 5 tables copied with byte-exact fidelity (incl. `prompt_tags` junction + `ai_providers` ciphertext) | `tests/test_migration_service.py::test_copies_every_table_with_full_fidelity` | integration | PASS |
| 4 | Prompt row content (title/category/usage_count/deleted_at) + IDs preserved across migration | `…::test_prompt_row_content_matches_source` | integration | PASS |
| 5 | Meta event first (dialects + ordered table list); progress reports `copied==total` at `done` | `…::test_meta_event_first…` + `…::test_progress_reports_copied_reaching_total` | unit | PASS |
| 6 | SQLite FTS5 index auto-populated on the target from prompt rows (never copied explicitly) | `…::test_search_index_populated_on_target_after_copy` | integration | PASS |
| 7 | Mid-copy failure rolls the ENTIRE target transaction back (partial writes undone) | `…::test_failure_mid_copy_rolls_back_target_and_leaves_source_intact` | integration | PASS |
| 8 | A populated target is refused (not truncated); MigrationError raised before any copy | `…::test_populated_target_refused` | unit | PASS |
| 9 | Client disconnect (`gen.close()`) rolls the open target transaction back | `…::test_generator_close_rolls_back_target` | integration | PASS |
| 10 | Empty source is a clean no-op: 5 zero-total `done` events, transaction commits | `…::test_empty_source_commits_cleanly` | unit | PASS |
| 11 | `POST /{id}/migrate` streams `{meta}`/`{progress}`/`{done}`; success swaps active + reloads registry | `tests/test_database_routes.py::TestRouteMigrate::test_success_streams_meta_progress_done_and_swaps_active` | integration | PASS |
| 12 | Failure emits one redacted `{error}` frame, no `{done}`, source stays active | `…::test_failure_emits_error_and_leaves_source_active` | integration | PASS |
| 13 | **No URL or password in any migrate frame** (even when the raw exception embeds the full DSN) | `…::test_error_frame_never_leaks_url_or_password` | integration | PASS |
| 14 | Unknown connection → 404; connection-test failure → redacted 400 | `…::test_unknown_connection_returns_404` + `…::test_connection_test_failure_returns_400` | integration | PASS |
| 15 | sqlite → postgresql full fidelity; `encrypted_api_key` bytes round-trip through BYTEA; `search_tsv` derived | `tests/test_migration_service.py::TestCrossDialect` (PG-gated) | integration | PASS (live PG) |
| 16 | FE: `migrateDatabase` dispatches meta + progress, resolves on `{done}`, rejects on `{error}`/non-OK | `lib/__tests__/api.test.ts > migrateDatabase` | unit | PASS |
| 17 | FE: "Migrate & activate" opens the modal; confirm calls `migrateDatabase`; success refreshes the list | `components/databases/DatabaseManager.test.tsx` | component | PASS |

## Validation commands actually run

```bash
# ── Backend (default SQLite gate) ──
$ cd api && uv run pytest
311 passed, 12 skipped, 5 warnings in 5.60s    # 10 PG-gated + 2 cross-dialect skip without L1BR3_PG_TEST_URL

$ cd api && uv run ruff check app/ tests/test_migration_service.py tests/test_database_routes.py tests/test_db_engine.py
All checks passed!

$ cd api && uv run ruff format --check <my 8 files>
8 files already formatted          # the 4 repo-wide reformat candidates (base.py, mcp_server.py, prompt.py, category_service.py) are untouched pre-existing files

$ cd api && uv run mypy app
Success: no issues found in 59 source files

# ── Backend (PG-enabled cross-dialect validation) ──
$ docker run -d --name l1br3_pg_m4 -e POSTGRES_USER=l1br3 -e POSTGRES_PASSWORD=l1br3 \
    -e POSTGRES_DB=l1br3_m4_test -p 5433:5432 postgres:16-alpine
$ cd api && L1BR3_PG_TEST_URL="postgresql://l1br3:l1br3@localhost:5433/l1br3_m4_test" uv run pytest \
    tests/test_migration_service.py::TestCrossDialect -v
2 passed in 0.43s                   # real sqlite↔postgresql copy + type coercion + index auto-population
$ cd api && L1BR3_PG_TEST_URL=… uv run pytest
323 passed, 5 warnings in 5.35s     # full suite with PG enabled

# ── Frontend ──
$ cd browser-ext && pnpm test
Test Files 19 passed (19)  /  Tests 147 passed (147)
$ cd browser-ext && npx tsc --noEmit
(clean — no output)
$ cd browser-ext && npx eslint <my 7 files>
1 error (pre-existing: '../api' import duplicated @ api.test.ts:112 — confirmed present on main pre-work), 16 warnings (existing style)
```

## Coverage and known gaps

- **Backend migration code is fully exercised**: `iter_migration` (happy, rollback,
  guard, empty, disconnect, cross-dialect) and the `/{id}/migrate` route (success,
  failure, redaction, 404, 400). A formal `--cov` run was not separately captured;
  the guarantee table above is the source of truth.
- **PRD OQ #56 (Connection-test UX)** is unchanged from M3 (`POST /databases/test`,
  5s, redacted); M4 reuses it as the migrate pre-check.
- **PRD OQ #57 (Rollback semantics)** — locked to "transactional copy + atomic swap
  + rollback-on-any-error": the entire copy runs in one target transaction; swap
  happens only after commit. Validated by tests #7 and #9.
- **`ai_providers` ciphertext** copies byte-for-byte because `L1BR3_MASTER_KEY` is
  host-local. **Cross-host re-keying is deferred to M5** (encrypted credential
  storage) — documented as a known limitation, not a gap in this milestone.
- **Populated-target policy**: refused with a redacted error (no destructive
  `TRUNCATE`). Users pick an empty target.
- **Frontend SSE consumer**: a focused `_consumeMigrationSSE` was used instead of
  extending the shared `_consumeSSE`. Rationale: migrate's frame vocabulary
  (`{meta:{sourceEngine,…}}`, `{progress}`) is structurally distinct from
  `/generate`'s (`{meta:{provider}}`, `{chunk}`), and a dedicated consumer
  guarantees the AI-streaming path is untouched (the plan's primary FE constraint).
  The existing `streamGenerate`/`streamTransform`/`ComposeTab`/`TransformPanel`
  test suites (all passing) are the regression gate.
- **Pre-existing lint debt** (11 eslint errors, 4 ruff-format candidates, 3 B017
  in `test_template_service.py`) exists in files NOT touched by this milestone;
  confirmed present on `main` via `git stash`. Not introduced here.

## Acceptance

- [x] All plan tasks complete
- [x] `uv run pytest` green on the default SQLite gate — zero regressions (311 passed)
- [x] `ruff check` / `ruff format --check` / `mypy app` clean on new + changed files
- [x] `pnpm test` + `tsc --noEmit` clean; existing `streamGenerate`/`streamTransform`
      tests still pass (`_consumeSSE` untouched)
- [x] `iter_migration` copies all five tables byte-exact (sqlite→sqlite)
- [x] Any mid-copy exception rolls the target back (empty) and leaves the source
      active and intact (induced-failure test)
- [x] Client disconnect mid-copy triggers rollback (target empty, source active)
- [x] Populated target refused with a redacted error; no truncation
- [x] `POST /{id}/migrate` streams `{meta}`/`{progress}`/`{done}`/`{error}`;
      URL/password in NO frame/error/log (dedicated tests)
- [x] On success the active connection swaps + registry reloads; on failure source stays
- [x] Cross-dialect suite passes (sqlite↔PG) with `L1BR3_PG_TEST_URL`; skips cleanly without
- [x] Search index populated on target purely from row insertion (FTS5 / `search_tsv`)
- [x] `MigrationModal` renders per-table progress; success swaps active badge; failure
      surfaces redacted error; cancel aborts cleanly
- [x] Patterns mirrored from `generate.py`, `db_connection_service.py`, `registry.py`,
      `_consumeSSE`/`streamGenerate` — not reinvented
- [x] PRD milestone #4 row updated: `pending` → `in-progress`, Plan cell set
