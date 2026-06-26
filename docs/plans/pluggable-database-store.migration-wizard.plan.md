# Plan: Pluggable Database Store — Migration Wizard (Milestone 4)

**Source PRD**: `docs/prds/pluggable-database-store.prd.md`
**Selected Milestone**: #4 — Migration wizard (on switch, copy all data to new target with progress + rollback)
**Complexity**: Large

## Summary

Add a streaming data-migration path so switching the active database copies the
user's data — not just the schema — onto the target. A new `POST /api/v1/databases/{id}/migrate`
endpoint streams Server-Sent Events (mirroring `/generate` and `/transform`) while it copies
`tags → prompts → prompt_tags → transform_modes → ai_providers` from the source engine to the
target inside a **single target transaction**. The active connection is swapped **only after the
copy commits**; any failure (or client disconnect) rolls the target back to its empty-but-migrated
state and leaves the source active. The frontend `DatabaseManager` grows a `MigrationModal` that
runs the stream and renders per-table progress, replacing today's static "empty target" warning.
No new Alembic revision is needed — the target schema is still built by the existing
`_migrate_target` (`alembic upgrade head` → `005`).

## Decisions on PRD Open Questions (locked for this plan)

| OQ | Decision for M4 | Rationale |
|---|---|---|
| #56 Connection-test UX | **Unchanged from M3** (`POST /databases/test`, 5s, redacted). Migrate reuses `test_connection` as its first guard | Already shipped in M3; no new surface |
| #57 Rollback semantics | **Transactional copy + atomic swap + rollback-on-any-error.** The entire row-copy runs inside ONE target transaction (`target_engine.begin()`). Any exception — including client disconnect — rolls the target back to empty-but-migrated (inert) and the source stays active. Swap (`set_active` + `reload_active_engine`) happens **only after commit**. "Restore-from-source" is not needed because we never swapped | Strictly safer than the PRD's alternate "mark target dirty" option: the target is left clean, not partially written. Matches the PRD risk row verbatim ("transactional copy + atomic swap of active DB + rollback-on-any-error") |

### Additional scope decisions (resolving findings from the codebase audit)

| Decision | Rationale |
|---|---|
| **No separate `categories` table copy** — `category` is a `String` column on `Prompt` (`models/prompt.py:22`) | Copying `prompts` carries categories. The PRD's "categories" line item is satisfied implicitly. No `Category` model exists |
| **Search-index is NOT copied as rows** — FTS5 triggers (SQLite, migration `001`) and the `search_tsv` generated column + GIN index (Postgres, migration `005`) are DB-maintained from prompt rows | Copying `prompts` repopulates the index automatically. The PRD's "search-index" line item is satisfied implicitly by row copy + each engine's auto-maintenance |
| **`ai_providers` IS copied** (scope expansion vs. the PRD's literal list) | Leaving it empty would silently drop the user's saved AI-provider config on switch — a regression vs. the source. `encrypted_api_key` is Fernet ciphertext bound to host-local `L1BR3_MASTER_KEY` (`config.py`); same-host migration (the only supported topology — bring-your-own DB) round-trips it byte-for-byte. Cross-host re-keying is M5's job |
| **Target must be empty** (refuse if `prompts`/`tags` already have rows before copy) | Re-migrating into a populated target would PK-collide or duplicate. Detect-and-refuse with a redacted, actionable error is safer than destructive `TRUNCATE`. Users re-activate an empty target or create a fresh one |
| **Promote `registry._engine_for_url` → `build_engine_for_url`** (public) | M4 needs to construct a target engine without disturbing the active singleton (`Depends(get_db)` only yields the source session). The private helper already does exactly this (`registry.py:56-60`); making it public avoids a duplicate dialect branch and gives tests a single seam |
| **Per-batch SSE, not per-row** | One `{progress}` frame per table-batch (default 500 rows) balances feedback frequency vs. event-loop overhead. Mirrors the coarse-grained `{chunk}` cadence of `/generate` |

## Scope lock (what is / isn't in M4)

**In scope**
- `services/migration_service.py` exposing `iter_migration(source, target) -> Iterator[MigrationEvent]`:
  a sync generator that runs the full copy inside one target transaction and yields
  `MigrationMeta` + `TableProgress` events. Rollback-on-exception via the `with target_engine.begin()`
  block; rollback-on-disconnect via the route calling `gen.close()`.
- `POST /api/v1/databases/{id}/migrate` — SSE endpoint mirroring `routes/generate.py`. Frames:
  `{meta}`, `{progress: {table, phase, copied, total}}`, `{done: true}`, `{error}`. On success:
  `connection_store.set_active(id)` + `reload_active_engine()`. On any failure: source stays active,
  target rolled back, redacted error frame. Reuses `_safe_error` (`db_connection_service.py:25-35`).
- `registry.build_engine_for_url(url)` — public rename of `_engine_for_url`.
- Bulk Core-level copy (`select(table).mappings()` → `insert(table), [dicts]` in batches) so the
  same code path works sqlite↔PG without dialect-specific SQL.
- Frontend: extend `_consumeSSE` to parse `{progress}`; add `migrateDatabase(baseUrl, id, {onMeta,onProgress})`;
  add a `MigrationModal` (confirm → streaming progress per table → done/error); add a
  "Migrate & activate" button on `ConnectionCard`; remove the static "empty target" warning at
  `DatabaseManager.tsx:159-162`.
- Empty-target detection (refuse populated targets with a redacted error).

**Out of scope (explicitly deferred)**
- Encrypted credential storage → **M5**. The migration handles ciphertext as opaque bytes; it does
  not re-encrypt or re-key. Cross-host migration (different `L1BR3_MASTER_KEY`) is documented as a
  known limitation resolved by M5.
- MySQL, in-browser wa-sqlite, multi-write replication → PRD-level out-of-scope.
- Bi-directional sync / keep-source-in-sync-after-switch → one-shot copy only.
- Re-migration into a populated target (refused; user must pick an empty target).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Streaming endpoint | `api/app/routes/generate.py:23-70` | `async def` taking `Request`; inner `async def event_stream()` yielding `f"data: {json.dumps(...)}\n\n"`; `{meta}/{chunk}/{done}/{error}` frames; `await request.is_disconnected()` cancellation; `StreamingResponse(media_type="text/event-stream", headers={Cache-Control, Connection, X-Accel-Buffering})` |
| Existing activate flow (the path M4 forks) | `api/app/services/db_connection_service.py:95-120` | load → `test_connection` → `_migrate_target` → `set_active` → `reload_active_engine`; on any pre-swap failure return early (source untouched). M4 inserts the copy between `_migrate_target` and `set_active` |
| Schema-migrate target (reused as-is) | `api/app/services/db_connection_service.py:68-83` | `_migrate_target(url)` → `alembic upgrade head` with URL injected via `cfg.set_main_option`. M4 calls this unchanged |
| Redaction helper | `api/app/services/db_connection_service.py:25-35` | `_safe_error(exc, url)` — `_DRIVER_MISSING` for `ModuleNotFoundError`, else `redact_message(str(exc), url, password)`. Reused verbatim for migrate error frames |
| Target engine construction | `api/app/db/engines/registry.py:56-60` | `_engine_for_url(url)`: `postgresql*` → `PostgresEngine(url)`, else `SqliteEngine(url)`. M4 promotes this to `build_engine_for_url` (public) |
| SSE client (FE) | `browser-ext/lib/api.ts:53-96` | `_consumeSSE(body, onChunk, {onMeta})`: `getReader()` + `TextDecoder`, split on `\n`, strip `"data: "`, `JSON.parse`, dispatch on `{chunk,done,error,meta}`. M4 adds `{progress}` + `onProgress` (additive, backward-compatible) |
| Streaming client wrapper (FE) | `browser-ext/lib/api.ts:253-277` (`streamGenerate`) | `fetch POST` with `Content-Type: application/json`, check `res.ok`, then `await _consumeSSE(res.body, onChunk, {onMeta})`. M4's `migrateDatabase` mirrors this |
| Manager activate wiring (FE) | `browser-ext/components/databases/DatabaseManager.tsx:82-90` | `activate` handler → `await activateDatabase(...)` → `load()`; `setError(...)` on throw. M4 adds a parallel `migrate` handler that opens the modal |
| Card action row (FE) | `browser-ext/components/databases/ConnectionCard.tsx` | Activate/Test/Edit/Delete buttons gated on `!isActive`. M4 adds `onMigrate` in the same conditional row |
| Test isolation (store) | `api/tests/test_db_connection_service.py:70-79` | `isolated_store` fixture: `monkeypatch.setenv("L1BR3_DATABASES_CONFIG", tmp)`, delete `L1BR3_DATABASE_URL`, reset registry singleton before+after |
| Real-second-DB test | `api/tests/test_db_connection_service.py:141-157` | `TestMigrateTarget.test_runs_alembic_head_against_a_fresh_sqlite` runs real `_migrate_target` against `sqlite:///<tmp>.db` + inspects via `sqlalchemy.inspect`. M4's copy tests follow this against a real target engine |
| PG-gated integration idiom | `api/tests/conftest.py:73-113` | `pg_engine`/`pg_session` fixtures `pytest.skip` unless `L1BR3_PG_TEST_URL`. M4's cross-dialect tests reuse these + add a paired sqlite-source fixture |
| Route leak assertion | `api/tests/test_database_routes.py` (mirror `test_provider_routes.py:29-46`) | `assert SECRET not in r.text`; assert URL/password appears in no frame |
| Logging | `api/app/db/connection_store.py:29,69,72,148` | `logger = logging.getLogger(__name__)` + `%`-style lazy formatting; never log raw URLs |

## Files to Change

### Backend

| File | Action | Why |
|---|---|---|
| `api/app/db/engines/registry.py` | UPDATE | Rename `_engine_for_url` → `build_engine_for_url` (public); update the two `_resolve_engine` callers (`registry.py:45,50`). Keep behavior identical |
| `api/app/schemas/database.py` | UPDATE | Add `MigrationTablePlan`, `MigrationMetaRead`, `MigrationProgressRead` Pydantic models (camelCase via existing `_camel`) for the SSE frame shapes + OpenAPI docs |
| `api/app/services/migration_service.py` | CREATE | `iter_migration(source, target) -> Iterator[MigrationEvent]`; `_COPY_ORDER`; `_copy_table` (batched Core select→insert); `MigrationEvent` union; empty-target guard; single target transaction; never logs secrets |
| `api/app/routes/databases.py` | UPDATE | Add `POST /{id}/migrate` SSE handler mirroring `generate.py:50-70`: meta frame → per-batch `{progress}` via `run_in_threadpool(next, gen)` → `{done}` (then `set_active`+`reload`) or `{error}` (redacted, source stays active). Reuses `_safe_error` |
| `api/tests/test_migration_service.py` | CREATE | Unit: full sqlite→sqlite copy fidelity (row counts + content per table); rollback on induced failure (target empty, source intact); empty source no-op; `ai_providers` ciphertext round-trip; copy order respects FKs; progress events emitted |
| `api/tests/test_database_routes.py` | UPDATE | Add `TestRouteMigrate`: SSE frame parsing; success swaps active + reloads; failure leaves source active; populated-target refused; **no URL/password in any frame**; client-disconnect path (mock `is_disconnected`) |
| `api/tests/conftest.py` | UPDATE | Add a `target_engine` fixture (isolated in-memory/file SQLite per test) + a `pg_source_and_target` fixture gated on `L1BR3_PG_TEST_URL` for cross-dialect integration |

### Frontend

| File | Action | Why |
|---|---|---|
| `browser-ext/types/index.ts` | UPDATE | Add `MigrationTablePlan`, `MigrationMeta`, `MigrationProgress` in the Database Manager section |
| `browser-ext/lib/api.ts` | UPDATE | Extend `_consumeSSE` parsed shape with `progress?` + `onProgress` opt (additive); add `migrateDatabase(baseUrl, id, {onMeta,onProgress})` mirroring `streamGenerate` |
| `browser-ext/components/databases/MigrationModal.tsx` | CREATE | Confirm → run → per-table progress bar + copied/total → done (now active) / error (source unchanged). Cancels via `AbortController` on close |
| `browser-ext/components/databases/ConnectionCard.tsx` | UPDATE | Add `onMigrate` prop + a "Migrate & activate" button in the action row (gated `!isActive`) |
| `browser-ext/components/databases/DatabaseManager.tsx` | UPDATE | Add `migrate` handler opening `MigrationModal`; replace static warning at lines 159-162 with live post-migrate status; refresh list on success |
| `browser-ext/components/databases/DatabaseManager.test.tsx` | UPDATE | Add cases: migrate button opens modal; mocked `migrateDatabase` progress updates the UI; success refreshes list + active badge; error leaves source active |
| `browser-ext/lib/__tests__/api.test.ts` | UPDATE | Add `migrateDatabase` cases: consumes `{meta}`/`{progress}`/`{done}`/`{error}` frames correctly |

## Migration Event & Frame Shapes (decision)

The service emits a typed event stream; the route serializes each to an SSE frame identical in
envelope to `/generate`/`/transform` (`data: <json>\n\n`):

```python
# services/migration_service.py
@dataclass(frozen=True)
class MigrationMeta:
    source_engine: str        # "sqlite" | "postgresql"
    target_engine: str
    tables: list[str]         # ["tags","prompts","prompt_tags","transform_modes","ai_providers"]

@dataclass(frozen=True)
class TableProgress:
    table: str
    phase: str                # "copying" | "done"
    copied: int
    total: int

MigrationEvent = MigrationMeta | TableProgress   # done/error are signaled by StopIteration / Exception
```

Wire frames:
- `data: {"meta":    {"sourceEngine": "...", "targetEngine": "...", "tables": [...]}}\n\n`
- `data: {"progress": {"table": "prompts", "phase": "copying", "copied": 500, "total": 1234}}\n\n`
- `data: {"done": true}\n\n`                       # success — target now active
- `data: {"error": "<redacted>"}\n\n`              # failure — source still active

Rationale: reuses the existing `{meta}/{done}/{error}` vocabulary verbatim and adds exactly one new
`{progress}` frame, so the FE `_consumeSSE` change is purely additive (a new optional callback).

## Copy Strategy (decision)

Core-level, dialect-agnostic, streamed in batches — no ORM relationships, no per-row inserts:

```python
# services/migration_service.py (sketch — not the implementation)
_COPY_ORDER = [Tag.__table__, Prompt.__table__, prompt_tags, TransformMode.__table__, AIProviderModel.__table__]
_BATCH = 500

def iter_migration(source: DatabaseEngine, target: DatabaseEngine) -> Iterator[MigrationEvent]:
    yield MigrationMeta(source.dialect, target.dialect, [t.name for t in _COPY_ORDER])
    with target.engine.begin() as target_conn, source.engine.connect() as source_conn:
        _assert_empty(target_conn)                       # refuse populated target
        for table in _COPY_ORDER:
            total = source_conn.execute(select(func.count()).select_from(table)).scalar_one()
            copied = 0
            yield TableProgress(table.name, "copying", copied, total)
            cursor = source_conn.execution_options(stream_results=True).execute(select(table))
            for batch in _chunked(cursor.mappings(), _BATCH):
                target_conn.execute(insert(table), [dict(r) for r in batch])
                copied += len(batch)
                yield TableProgress(table.name, "copying", copied, total)
            yield TableProgress(table.name, "done", copied, total)
```

Why this shape:
- **One target transaction** (`target.engine.begin()`) — any exception (including `GeneratorExit`
  from `gen.close()` on disconnect) rolls every insert back. Source is read-only.
- **Core `select(table).mappings()` → `insert(table), [dicts]`** — SQLAlchemy binds+coerces per
  dialect (SQLite TEXT ↔ PG types, `0/1` ↔ `bool`, TEXT timestamps ↔ `timestamptz`), so the same
  code works sqlite→PG, PG→sqlite, and same-dialect. No dialect branches in the service.
- **`stream_results=True` + batched insert** — constant memory on large datasets; no load-all-then-write.
- **`prompt_tags` is a `Table`**, not a model — Core handles it identically.
- **Search-index writes are automatic** — SQLite FTS5 triggers fire on the inserts; the PG
  `search_tsv` generated column derives from the inserted `title`/`content`. No explicit index SQL.

## Tasks

### Task 1: Promote `build_engine_for_url` (RED→GREEN)
- **Action**: In `registry.py`, rename `_engine_for_url` → `build_engine_for_url`; update the two
  internal callers in `_resolve_engine` (`registry.py:45,50`). Add a one-line module docstring note
  that it's the public dialect-dispatch seam. No behavior change.
- **Mirror**: existing `registry.py:56-60` (rename only).
- **Validate**: `cd api && uv run pytest tests/test_db_engine.py tests/test_db_engine_postgres.py -k registry` (unchanged behavior); `cd api && uv run mypy app`.

### Task 2: `migration_service.iter_migration` — happy path (RED→GREEN)
- **Action**: Create `services/migration_service.py`:
  - `MigrationEvent` union + the two frozen dataclasses above.
  - `_COPY_ORDER` (the five tables in FK-safe order).
  - `iter_migration(source, target)` yielding `MigrationMeta` then `TableProgress` per batch inside
    the single `target.engine.begin()` transaction; `_assert_empty(target_conn)` first.
  - `_chunked(iterator, n)` helper.
  - Module logger `logging.getLogger(__name__)` (info-level phase logs; **never** log URLs).
- **Mirror**: `db_connection_service.py:95-120` (service-level flow); Core bulk pattern
  (`select(...).mappings()` + `insert(table), list`).
- **Validate**: `cd api && uv run pytest tests/test_migration_service.py -k "happy or fidelity or order"` (seed source sqlite, migrate to a fresh target sqlite file, assert per-table row counts + content equality + `prompt_tags` rows + `ai_providers.encrypted_api_key` bytes round-trip).

### Task 3: Rollback + empty-target guard + empty-source (RED→GREEN)
- **Action**: In the same module + test file:
  - Induce failure mid-copy (monkeypatch the target `insert` to raise on the 2nd batch) → assert the
    target transaction rolled back (all five tables empty on target), source unchanged, exception
    propagates (route will translate to `{error}`).
  - `_assert_empty` raises a clear, non-secret-bearing `MigrationError("Target is not empty ...")`
    when `tags`/`prompts` have rows → assert target untouched.
  - Empty source (no rows anywhere) → generator yields meta + five zero-total `done` events, commits
    the (empty) transaction cleanly.
- **Mirror**: M3's "on any failure return early, source untouched" guarantee (`db_connection_service.py:110-116`).
- **Validate**: `cd api && uv run pytest tests/test_migration_service.py -k "rollback or empty or guard"`.

### Task 4: `POST /{id}/migrate` SSE route (RED→GREEN)
- **Action**: In `routes/databases.py`, add the endpoint mirroring `generate.py:23-70`:
  - Resolve source = `get_active_engine()`; load target conn via `connection_store.get_connection(id)`
    (404 if missing); build target engine via `registry.build_engine_for_url(conn.url)`.
  - Guard: `test_connection(conn.engine, conn.url)` (redacted 400 on fail) then `_migrate_target(conn.url)`
    (redacted 400 on fail) — same pre-checks as `activate` (`db_connection_service.py:110-116`).
  - `async def event_stream()`:
    - `gen = iter_migration(source, target)`
    - emit `{meta}` (consume the generator's first event).
    - loop: `await request.is_disconnected()` → `gen.close()` + return; else
      `ev = await run_in_threadpool(next, gen)`; on `StopIteration` → `connection_store.set_active(id)`
      + `reload_active_engine()` + emit `{done: true}` + return; on `Exception` →
      emit `{error: _safe_error(exc, conn.url)}` + return (no swap); else emit `{progress: ...}`.
  - Return `StreamingResponse(event_stream(), media_type="text/event-stream", headers={...})`.
- **Mirror**: `routes/generate.py:50-70` (SSE shape + headers); `db_connection_service.py:95-120` (pre-check + swap sequence).
- **Validate**: `cd api && uv run pytest tests/test_database_routes.py -k migrate` — using `TestClient`'s SSE consumption (read the raw stream); assert frames parse, success swaps active (registry URL changes), failure leaves source active, populated-target refused, and **no URL/password in any frame** (`assert SECRET not in raw`).

### Task 5: Cross-dialect integration (PG-gated, RED→GREEN)
- **Action**: In `conftest.py`, add a `pg_source_and_target` fixture pair (both gated on
  `L1BR3_PG_TEST_URL`, each gets its own schema via `CREATE SCHEMA`/`DROP SCHEMA` per test). In
  `test_migration_service.py`, add `@pytest.mark.skipif(not _PG_URL, ...)` cases: sqlite→PG and
  PG→sqlite full fidelity; datetime/boolean/bytes coercion; `search_tsv` populated on PG target
  after copy; FTS5 populated on sqlite target after copy.
- **Mirror**: `conftest.py:73-113` (`pg_engine`/`pg_session` skip idiom); `test_search_parity.py` cross-engine style from M2.
- **Validate**: `cd api && L1BR3_PG_TEST_URL=postgresql://… uv run pytest tests/test_migration_service.py -k "cross or pg"` (skips cleanly without the env).

### Task 6: Frontend `_consumeSSE` extension + `migrateDatabase` (RED→GREEN)
- **Action**:
  - `lib/api.ts`: extend the `_consumeSSE` parsed shape with `progress?: {table,phase,copied,total}`
    and an optional `onProgress` callback (additive — existing callers unaffected). Add
    `migrateDatabase(baseUrl, id, {onMeta, onProgress})` mirroring `streamGenerate:253-277`.
  - `types/index.ts`: add `MigrationTablePlan`, `MigrationMeta`, `MigrationProgress`.
- **Mirror**: `lib/api.ts:53-96` (`_consumeSSE`); `lib/api.ts:253-277` (`streamGenerate`).
- **Validate**: `cd browser-ext && pnpm test lib/__tests__/api.test.ts` (extend with `migrateDatabase` frame cases); `cd browser-ext && npx tsc --noEmit`.

### Task 7: Frontend `MigrationModal` + Card button + Manager wiring (RED→GREEN)
- **Action**:
  - `databases/MigrationModal.tsx`: confirm step (source → target summary, "Target must be empty"
    note) → run step (calls `migrateDatabase`, renders per-table `copied/total` progress, phase
    badges) → done (active badge + close) / error (redacted message, source-unchanged note, retry).
    Cancel via `AbortController` on modal close.
  - `databases/ConnectionCard.tsx`: add `onMigrate?: () => void` prop; render a "Migrate & activate"
    button in the action row (gated `!isActive`), alongside Activate.
  - `databases/DatabaseManager.tsx`: add `migrate` handler opening the modal with the selected
    connection; remove the static warning at lines 159-162 (replaced by the modal's live status);
    on success `await load()` to refresh the active badge.
- **Mirror**: `components/databases/ConnectionEditModal.tsx` (modal structure); `ModelsManager.tsx:57-138` (manager → modal wiring); `ConnectionCard.tsx` action-row conditionals.
- **Validate**: `cd browser-ext && pnpm test components/databases`.

### Task 8: Regression + full gate (GREEN)
- **Action**: Confirm M3 activate still works unchanged; default zero-config path untouched;
  existing SSE endpoints (`/generate`, `/transform`) unaffected by the `_consumeSSE` extension.
- **Mirror**: M3 acceptance gate.
- **Validate**:
  - `cd api && uv run pytest`
  - `cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy app`
  - `cd browser-ext && pnpm test && npm run lint && npx tsc --noEmit`
  - `cd browser-ext && pnpm test lib/__tests__/api.test.ts` (confirm `streamGenerate`/`streamTransform` still pass — `_consumeSSE` is backward-compatible).

### Task 9: TDD evidence doc
- **Action**: Write `docs/testing/pluggable-database-store.migration-wizard.tdd.md` mirroring the
  M1–M3 evidence structure: task table (RED/GREEN per task), test-spec table, coverage report,
  acceptance checklist, known gaps (cross-host master-key portability deferred to M5; populated
  target refused rather than truncated).
- **Mirror**: `docs/testing/pluggable-database-store.database-manager-ui.tdd.md`.
- **Validate**: manual review against actual test-run output.

## Validation

```bash
# ── Backend: focused, during TDD loops ──
cd api && uv run pytest tests/test_migration_service.py
cd api && uv run pytest tests/test_database_routes.py -k migrate
cd api && uv run pytest tests/test_db_engine.py tests/test_db_engine_postgres.py -k registry

# ── Backend: full gate (AGENTS.md: `just lint` is incomplete — run these explicitly) ──
cd api && uv run pytest
cd api && uv run ruff check .
cd api && uv run ruff format --check .
cd api && uv run mypy app

# ── Backend: security — no secret leakage in any migrate frame ──
cd api && uv run pytest tests/test_database_routes.py tests/test_migration_service.py -k "leak or redact or migrate"

# ── Backend: rollback-on-failure smoke (source survives a botched copy) ──
cd api && uv run python -c "
from app.db.engines.sqlite import SqliteEngine
from app.services.migration_service import iter_migration
src = SqliteEngine('sqlite:///:memory:'); tgt = SqliteEngine('sqlite:///:memory:')
# seed source, then force a failure mid-copy and assert tgt is empty + src intact
"

# ── Backend: cross-dialect integration (requires a live PG; skip otherwise) ──
export L1BR3_PG_TEST_URL="postgresql://l1br3:l1br3@localhost:5432/l1br3_m4_test"
cd api && uv run pytest tests/test_migration_service.py -k "cross or pg"

# ── Backend: default zero-config preserved (no env, fresh file) ──
cd api && L1BR3_DATABASES_CONFIG=/tmp/m4_empty.json uv run python -c \
  "from app.db.connection_store import list_connections, get_active_id; cs=list_connections(); print(len(cs), get_active_id() is not None)"
#   → 1 True  (default SQLite seeded + active; migrate is opt-in, not forced)

# ── Frontend ──
cd browser-ext && pnpm test
cd browser-ext && npm run lint
cd browser-ext && npx tsc --noEmit

# ── Frontend: streaming parity (existing SSE consumers unaffected) ──
cd browser-ext && pnpm test lib/__tests__/api.test.ts
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cross-dialect type coercion (SQLite TEXT ↔ PG; `0/1`↔bool; TEXT ts ↔ `timestamptz`; bytes ↔ BYTEA) | High | Core-level `select`+`insert` lets SQLAlchemy bind/coerce per dialect; Task 5 cross-dialect suite (gated on `L1BR3_PG_TEST_URL`) is the parity gate. If a type refuses to coerce, the target transaction rolls back wholesale (no partial state) |
| Large dataset OOM / long copy blocks the event loop | Medium | `stream_results=True` + batched insert = constant memory; the copy runs in the threadpool (`run_in_threadpool(next, gen)`), so only one batch at a time blocks a worker, never the event loop. Default batch 500 is tunable |
| Client disconnect mid-copy leaves a half-written target | Medium | `gen.close()` on disconnect throws `GeneratorExit` inside the `with target.engine.begin()` block → full rollback. Target returns to empty-but-migrated (inert); source stays active. Asserted by a dedicated test |
| Target not empty (user re-activating a previously-used DB) → PK collisions or duplicates | Medium | `_assert_empty` refuses populated targets up front with a redacted, actionable error; no destructive `TRUNCATE`. Documented "pick an empty target" UX in the modal |
| `ai_providers` ciphertext not portable across hosts (different `L1BR3_MASTER_KEY`) | Medium | Same-host migration round-trips ciphertext byte-for-byte (the only supported topology — bring-your-own DB bound to `127.0.0.1`). Cross-host re-keying is explicitly deferred to M5; documented in the modal + evidence doc |
| `_consumeSSE` extension breaks existing `/generate`/`/transform` consumers | Low | Change is purely additive (new optional `progress?` field + `onProgress` opt). Task 8 re-runs the full FE suite incl. `streamGenerate`/`streamTransform` tests as the regression gate |
| `alembic upgrade head` on target hits a non-empty unrelated DB before the copy guard runs | Low | `_migrate_target` is idempotent (existing M3 behavior); the `_assert_empty` copy guard runs AFTER schema migrate and refuses non-empty `prompts`/`tags`. A truly unrelated DB would get schema added then be refused — acceptable (no data destroyed) |
| Secret leakage in error frames during copy | Medium | Reuse `_safe_error` (`db_connection_service.py:25-35`) on every error path; dedicated test asserting the URL/password appears in no `{error}` frame, no log line, no exception text reaching the client |
| `run_in_threadpool(next, gen)` per-batch overhead on very large datasets | Low | Coarse-grained (one thread hop per batch of 500, not per row). If profiling shows overhead, batch size is a single module constant; the queue-based alternative is documented but not built unless needed (YAGNI) |

## Acceptance

- [ ] All tasks complete
- [ ] `cd api && uv run pytest` green on the default SQLite gate — zero regressions vs M3
- [ ] `ruff check` / `ruff format --check` / `mypy app` clean on new + changed files
- [ ] `cd browser-ext && pnpm test` + `npm run lint` + `tsc --noEmit` clean; existing
      `streamGenerate`/`streamTransform` tests still pass (`_consumeSSE` change is additive)
- [ ] `iter_migration` copies all five tables with byte-exact fidelity (sqlite→sqlite) including
      `prompt_tags` rows and `ai_providers.encrypted_api_key` bytes
- [ ] Any mid-copy exception rolls the target transaction back (target empty) and leaves the source
      active and intact — asserted by an induced-failure test
- [ ] Client disconnect mid-copy triggers rollback (target empty, source active) — asserted
- [ ] Populated target is refused with a clear, redacted error; no destructive truncation
- [ ] `POST /api/v1/databases/{id}/migrate` streams `{meta}`/`{progress}`/`{done}`/`{error}` frames;
      the URL/password appears in **no** frame, error, or log (asserted by dedicated tests)
- [ ] On migrate success the active connection swaps and the registry reloads (source → target);
      on failure the source stays active
- [ ] Cross-dialect suite passes (sqlite↔PG) when run with `L1BR3_PG_TEST_URL`; skips cleanly without
- [ ] Search-index is populated on the target after copy (FTS5 on sqlite, `search_tsv` on PG) purely
      from row insertion — no explicit index SQL in the service
- [ ] `MigrationModal` renders per-table progress; success swaps the active badge; failure surfaces a
      redacted error with "source unchanged" guidance; cancel aborts cleanly
- [ ] Patterns mirrored from `generate.py` (SSE), `db_connection_service.py` (activate/redact),
      `registry.py` (engine dispatch), `_consumeSSE`/`streamGenerate` (FE streaming) — not reinvented
- [ ] TDD evidence doc written; PRD milestone #4 row updated: `pending` → `in-progress`, Plan cell
      set to this artifact's path

---
*Next: Milestone 5 (Encrypted credential storage) — re-run `/plan docs/prds/pluggable-database-store.prd.md` once M4 ships. M5 will retrofit `crypto.encrypt`/`decrypt` onto `connection_store` credentials and resolve the cross-host `ai_providers` master-key portability gap noted above.*
