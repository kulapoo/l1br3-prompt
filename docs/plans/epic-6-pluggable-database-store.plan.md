# Plan: EPIC-6 — Pluggable Database Store  🔵 (~80%)

**Roadmap**: EPIC-6, F17 (✅ shipped) + F18 (⚪ pending) — pluggable DB engine (default SQLite +
PostgreSQL), Database Manager UI, migration wizard, encrypted credential storage.
**Source PRD**: `docs/prds/pluggable-database-store.prd.md`

> Consolidated from four milestone plans (M1–M4). All four shipped (F17); F18 (encrypted DB
> credentials) is the remaining security-hardening follow-up tracked in the roadmap.

## M1 — Engine Abstraction · ✅ Shipped · *Medium*

Pure refactor: `DatabaseEngine` + `SearchBackend` Protocols in `api/app/db/engines/`; the previous
hardcoded SQLite behavior moves into `SqliteEngine` behind the protocol; a registry accessor is
shared by app startup, Alembic env, and tests. Zero-config SQLite default preserved bit-for-bit.

- New: `db/engines/{base,sqlite,registry,__init__}.py`; `db/engine.py` becomes a re-export shim
  (preserves every existing `from app.db.engine import …` site).
- `PromptRepository.find_all` delegates search to `engine.search.search_prompts()` — no
  dialect-specific SQL in the repository.
- FTS5 DDL moved out of `conftest.py` into `SqliteEngine.search.init()`.
- Config: `L1BR3_DATABASE_URL` (any SQLAlchemy URL) takes precedence over `L1BR3_DB_PATH`.
- `ConnectionTest(ok, error)` dataclass defined here as the seam M3 later exercises.

## M2 — PostgreSQL Engine · ✅ Shipped · *Large*

Second concrete `DatabaseEngine` impl — `PostgresEngine` + `_PostgresTsVectorSearch`. Registry
branches on URL dialect (`postgresql*` → Postgres, else SQLite). Search parity with FTS5 via a
stored generated tsvector column + GIN index.

- Adds `psycopg[binary]>=3.2` dep.
- Migration `005_postgres_tsvector.py` adds `search_tsv` generated column + GIN index, guarded by
  `dialect.name == "postgresql"` (no-op on SQLite); idempotent.
- tsvector uses `'simple'` dictionary for FTS5 tokenizer parity; `setweight` ranks title (A) above content (B).
- Query uses `plainto_tsquery` (tolerates unquoted user input, like FTS5).
- Integration tests gated on `L1BR3_PG_TEST_URL`; `test_search_parity.py` asserts recall ≥ 95% both
  directions and 100% on exact-substring queries.

## M3 — Database Manager UI · ✅ Shipped · *Large*

Settings page mirroring the AI Models Manager: engine selector, guided form (host/port/db/user/pass)
**or** advanced "paste connection string" input, test-connection, set-active. SQLite remains the
zero-config default.

- Connection configs persist in `~/.l1br3/databases.json` (0600; path via `L1BR3_DATABASES_CONFIG`):
  - **File, not DB** — avoids chicken-and-egg (config can't live in the DB it describes).
  - **API-side, not `browser.storage.local`** — the API process must know which DB to hit at boot;
    extension storage is invisible to it.
  - Atomic write (temp + `os.replace`); malformed file → seeded default, never crashes boot.
- Canonical stored value = SQLAlchemy URL string (consumed unchanged by `SqliteEngine`/`PostgresEngine`).
- Registry precedence becomes: **stored active > `L1BR3_DATABASE_URL` > `L1BR3_DB_PATH` > default**;
  `reload_active_engine()` invalidates the cached singleton on swap.
- New routes: `/api/v1/databases` CRUD + `POST /test` (5s timeout, redacted errors) +
  `POST /{id}/activate` (test → `alembic upgrade head` on target → `set_active` → reload).
  `_to_read` parses URL into non-secret fields; Read shape exposes `hasPassword` + masked URL only;
  URL/password appears in no response, error, or log.
- FE: new `databases` admin view (`DatabaseManager` + `ConnectionCard` + `ConnectionEditModal` +
  `engineMeta`) mirroring `models/` components; `lib/api.ts` gains db client fns.
- Scope boundary: no data copy on switch (M4's job); no encryption at rest (M5's job).

## M4 — Migration Wizard · ✅ Shipped · *Large*

Streaming data-migration so switching the active DB copies user data — not just schema — onto the
target. `POST /api/v1/databases/{id}/migrate` SSE endpoint mirrors `/generate`/`/transform`:
`{meta}` / `{progress: {table, phase, copied, total}}` / `{done}` / `{error}` frames.

- `services/migration_service.iter_migration(source, target)` — Core-level bulk copy
  (`select(table).mappings()` → batched `insert(table), [dicts]`) inside ONE target transaction;
  dialect-agnostic (works sqlite↔PG via SQLAlchemy bind/coerce).
- Copy order (FK-safe): `tags → prompts → prompt_tags → transform_modes → ai_providers`.
  - `category` rides on `prompts` (String column, no separate table).
  - Search-index auto-repopulates from row inserts (FTS5 triggers / `search_tsv` generated column).
  - `ai_providers.encrypted_api_key` ciphertext round-trips on same-host migration.
- Rollback-on-any-error (incl. client disconnect via `gen.close()` → `GeneratorExit` inside
  `target.engine.begin()`): target rolls back to empty-but-migrated, source stays active. Active
  connection swaps only after the copy commits.
- Target must be empty — populated targets are refused with a redacted error (no destructive truncate).
- `registry._engine_for_url` promoted to public `build_engine_for_url`.
- FE: `MigrationModal` with per-table progress + cancel via `AbortController`; "Migrate & activate"
  button on `ConnectionCard`; `_consumeSSE` gains optional `{progress}` + `onProgress` (purely
  additive — existing `streamGenerate`/`streamTransform` callers unaffected).

## F18 — Encrypted DB credential storage · ⚪ Pending (tracked in roadmap) · _High_

Security-hardening follow-up to F17 (mirrors F16's role in EPIC-5). **Narrow scope:** retrofit
`crypto.encrypt`/`decrypt` (from EPIC-5 M3) onto `connection_store` credentials — whole-URL Fernet
encryption, same master key as F16 (no new env var); transparent plaintext upgrade for existing
F17 installs; graceful boot-time decrypt failure (fallback to SQLite default + `undecryptable`
flag, never crashes boot); redaction hardening (neutralize `PostgresEngine.from_env` URL-echo,
`.gitignore` defense-in-depth). The cross-host `ai_providers` master-key portability gap noted in
M4 is **deferred to F19**. _PRD: [encrypted-db-credential-storage.prd.md](../prds/encrypted-db-credential-storage.prd.md)_

## F19 — Cross-host master-key portability · ⚪ Pending (tracked in roadmap) · _Medium_

Resolve the `ai_providers.encrypted_api_key` ciphertext portability gap surfaced in M4: migrating
a DB to a host whose `~/.l1br3/master.key` differs leaves every BYOK key (and, post-F18, every
encrypted DB URL) undecryptable. Candidate approaches: a passphrase-derived master key via KDF
(PBKDF2/scrypt/argon2) replacing the auto-generated file key, or a master-key export/import flow
bundled with migrations. Depends on F18. _PRD: —_
