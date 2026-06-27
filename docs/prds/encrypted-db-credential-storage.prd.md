# Encrypted DB Credential Storage

```yaml
epic: EPIC-6
feature: F18
```

## Problem

F17 shipped a pluggable database store: users can configure the backend to use
SQLite (default) or PostgreSQL, with connection configs persisted in
`~/.l1br3/databases.json`. For PostgreSQL — and any future credential-bearing
engine — that file contains the full connection URL including the password,
**in plaintext at rest**.

`api/app/db/connection_store.py:14-16` documents the deferral explicitly:

> Credentials live in plaintext here for the M3 functional MVP; M5 retrofits
> `app.services.security.crypto` encryption onto the credential-bearing URL.

The crypto substrate already exists and protects BYOK provider keys at rest
(F16). F18 extends that same protection to DB connection URLs, and closes the
two latent secret-leak tripwires F17 left behind.

## Evidence

- `connection_store.py:14-16` — plaintext-at-rest deferral note.
- `docs/prds/pluggable-database-store.prd.md:43,53` — F17 PRD explicitly defers
  encrypted credential storage to "milestone 5" and lists it as `pending`.
- `docs/prds/pluggable-database-store.prd.md:64` — risk row: "Credential leakage
  in error messages (Medium/High)".
- F16 (EPIC-5) already ships the exact pattern for BYOK provider keys
  (`services/security/crypto.py` + `models/ai_provider.encrypted_api_key`).

## Users

- **Primary:** any user who configures a non-default DB engine (PostgreSQL, or
  future credential-bearing engines). Their DB password is currently readable by
  anything with filesystem access to `~/.l1br3/`.
- **Secondary:** every install — benefits from the redaction and `.gitignore`
  defense-in-depth even on the default SQLite path (which carries no
  credentials).
- **Not for:** cross-host DB migration scenarios where the target host has a
  different master key — that portability gap is tracked separately as F19.

## Hypothesis

We believe **retrofitting `crypto.encrypt`/`decrypt` onto `connection_store`
URLs** will **eliminate plaintext DB credentials at rest** for **all users with a
configured non-default engine**. We'll know we're right when **no plaintext DB
URL survives any write to `~/.l1br3/databases.json`** (verified by on-disk grep
in the test suite) and **a rotated or lost master key never crashes app boot**.

## Success Metrics

| Metric                                   | Target             | How measured                                                              |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------- |
| Plaintext-at-rest                        | 0 bytes            | On-disk grep of `databases.json` for the password after any write         |
| Boot resilience under key rotation       | 100% boots succeed | Wrong-master-key integration test: registry returns fallback engine       |
| Legacy F17 installs upgraded             | 100% silent        | Plaintext-seeded load re-saved encrypted, no user prompt                  |
| No regression in error redaction         | 0 leaks            | Existing `test_error_frame_never_leaks_url_or_password` stays green       |
| Repo test coverage                       | >= 80% maintained  | `just test` + coverage report                                             |

## Scope

**In scope (Narrow)**

1. Encrypt the DB connection URL at rest in `connection_store.py` (whole-URL
   Fernet encryption via existing `crypto.encrypt`/`decrypt`; same master key as
   F16 — no new env var, no second key).
2. Transparent one-time upgrade of existing plaintext `databases.json` records
   on first load (no explicit migration command, no user prompt).
3. Graceful boot-time decrypt failure: a rotated or lost master key falls back
   to the zero-config SQLite default and flags the affected connection
   `undecryptable` in the Read shape — never crashes boot (mirrors F16's
   `ProviderKeyError` philosophy).
4. Redaction hardening: neutralize the latent `PostgresEngine.from_env`
   URL-echo; add `.gitignore` entries for `databases.json` and `*.key`; retire
   the `connection_store.py:14-16` plaintext-deferral note.
5. Database Manager UI surfaces `undecryptable` connections with a re-enter
   affordance, AND a **persistent sidebar banner** appears while the *active*
   connection is in the SQLite-fallback state (mirrors the existing offline
   banner pattern in `PromptsTab.tsx:82-92`). Driven by a new
   `useActiveDatabase` React Query hook consumed by `Sidebar.tsx`.

**Out of scope (deferred to F19)**

- Cross-host master-key portability gap: when a DB is migrated to a host whose
  `~/.l1br3/master.key` differs, copied `ai_providers.encrypted_api_key`
  ciphertext fails to decrypt. Tracked as **F19**.
- Passphrase-derived master key / KDF (PBKDF2/scrypt/argon2) rework.
- Bulk re-key / master-key rotation utility.
- MySQL engine (still deferred from F17).

## Design

### Approach

**Approach A — whole-URL field-level encryption** (chosen over password-only and
whole-file; see Alternatives below).

- **Boundary:** a single encrypt/decrypt seam in `connection_store`. The write
  path (`add_connection`/`update_connection` -> `_to_record`) stores
  `encrypt(conn.url)` as a base64 Fernet token string (JSON-safe). The read path
  (`_parse_connections`) decrypts via `_decrypt_or_legacy` before constructing
  `StoredConnection` — the plaintext URL exists only in-process.
- **Master key:** `app.config.get_master_key()` verbatim — `L1BR3_MASTER_KEY`
  env > `~/.l1br3/master.key` (0600, auto-generated). The same Fernet key
  already protects F16's BYOK keys; F18 extends its scope to DB URLs. No second
  key, no new env var.
- **Contracts preserved:** `build_engine_for_url(url)` and the migration wizard
  still receive a plaintext URL string — F17's "URL string is canonical"
  contract is intact. The Read schema `DatabaseConnectionRead` keeps the same
  observable wire shapes (`masked_url`, `has_password`); masking now happens
  decrypt-side instead of plaintext-side.
- **Atomicity:** `_save()` continues to use temp + `os.replace` with 0600 perms.

### Failure modes

`_parse_connections` returns each record with an `undecryptable` flag:

| Situation                          | Result                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Token valid + master key present   | Decrypt -> engine built normally                                                |
| Master key missing                 | `get_master_key()` auto-generates a new key -> old tokens undecryptable -> flagged |
| Master key rotated                 | Old tokens fail `InvalidToken` -> flagged                                        |
| Legacy plaintext URL (F17 install) | `InvalidToken` -> used as plaintext -> re-saved encrypted on next write         |

If the **active** connection is undecryptable, the registry falls back to
`SqliteEngine.from_env()` so the app stays functional. The Database Manager UI
shows the connection flagged with a "Re-enter credentials" affordance, AND a
persistent amber banner renders at the top of the sidebar shell (`Sidebar.tsx`,
mirroring the `PromptsTab.tsx:82-92` offline-banner pattern) reading e.g.
"DB 'prod' couldn't be decrypted — fell back to local SQLite. Re-enter
credentials." The banner persists across tabs while the active connection
remains undecryptable and clears once credentials are re-entered and the
connection is re-activated. Saving the connection again re-encrypts under the
current master key.

### Alternatives considered

- **B — password-only encryption:** store parsed `{host, port, db, user,
  enc_password}`. Rejected: diverges from F17's canonical-URL contract that
  `build_engine_for_url` depends on; adds parsing surface and failure modes for
  no threat-model gain (the store is read twice per session, so decrypting for
  masked display is free).
- **C — whole-file encryption:** encrypt the entire `databases.json` blob.
  Rejected: loses partial reads and human debuggability for support; connection
  labels are not secret, so hiding them is overkill.

## Files

| File                                                | Change                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `api/app/db/connection_store.py`                      | Encrypt-on-write, decrypt-on-read, `_decrypt_or_legacy`, `undecryptable` tag, retire deferral note |
| `api/app/db/engines/registry.py`                      | Active-conn-undecryptable -> fall back to SQLite default                            |
| `api/app/schemas/database.py`                         | Add `undecryptable: bool = False` to `DatabaseConnectionRead`                       |
| `api/app/db/engines/postgres.py`                      | Drop URL from `from_env` error message                                              |
| `browser-ext/components/databases/ConnectionCard.tsx` | Amber flag + "Re-enter credentials" when `undecryptable`                            |
| `browser-ext/components/Sidebar.tsx`                   | Persistent amber banner while the active connection is undecryptable (mirrors `PromptsTab.tsx:82-92`) |
| `browser-ext/hooks/useActiveDatabase.ts` (new)         | React Query hook exposing the active connection incl. `undecryptable` for the sidebar |
| `browser-ext/types/index.ts`                          | Add `undecryptable?: boolean` to `DatabaseConnectionRead`                           |
| `.gitignore`                                          | `databases.json`, `*.key`                                                            |
| `api/tests/test_connection_store.py`                  | New tests (see Testing strategy)                                                    |
| `api/tests/test_db_engine_postgres.py`                | `from_env` message no longer contains URL                                           |

No DB migration required — `databases.json` is a file store, not a table.

## Testing strategy

New tests in `test_connection_store.py` (AAA pattern, security-focused):

- `test_url_encrypted_at_rest` — after `add_connection`, the on-disk JSON file
  contains no plaintext password/host, only a Fernet token.
- `test_round_trip_preserves_url` — encrypt -> save -> load -> decrypt equals
  the original URL byte-for-byte (preserves `:153-162` semantics).
- `test_legacy_plaintext_upgrades_transparently` — seed a plaintext
  `databases.json`; load works; next save re-encrypts (token on disk post-save).
- `test_wrong_master_key_marks_undecryptable` — rotate `L1BR3_MASTER_KEY`
  between save and load; record flagged `undecryptable=True`; no exception.
- `test_undecryptable_active_falls_back_to_sqlite` — registry returns
  `SqliteEngine`; app boots.
- `test_reenter_credentials_reencrypts` — save over an undecryptable connection;
  flag clears; encrypts under the current key.
- `test_0600_perms_preserved_through_encrypt_path` — file mode stays 0600.

Plus `test_db_engine_postgres.py`: assert `from_env`'s error message no longer
contains the URL string.

Frontend (vitest):

- `useActiveDatabase.test.ts` — returns the active connection's `undecryptable`
  flag from `GET /api/v1/databases`.
- `Sidebar.test.tsx` — renders the persistent amber banner when the active
  connection is `undecryptable`; hides it otherwise.

Existing leak tests (`test_database_routes.py`, `test_db_connection_service.py`)
stay green — the Read shape is observably identical.

## Acceptance criteria (Definition of Done)

- [ ] `~/.l1br3/databases.json` contains zero plaintext DB URLs after any write.
- [ ] Existing F17 plaintext installs auto-upgrade silently on first load.
- [ ] A rotated or lost master key never crashes boot — falls back to SQLite and
      flags the connection `undecryptable`.
- [ ] While the active connection is undecryptable, a persistent sidebar banner
      makes the SQLite-fallback state visible across all tabs.
- [ ] No new secret-leak vectors; `from_env` no longer echoes the URL.
- [ ] `just test` (both suites) + `just lint` + `pre-commit run --all-files`
      (mypy --strict, eslint, prettier, ruff, detect-secrets) all pass.
- [ ] `just build` succeeds.
- [ ] Roadmap: F18 -> `- [x]`, Status Summary EPIC-6 -> 100%; F19 tracked for
      the portability gap.

## Risks

| Risk                                                   | Likelihood | Impact | Mitigation                                                                                                  |
| ------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Transparent upgrade misclassifies a token as plaintext  | Low        | Medium | Fernet tokens are self-describing (`gA...`); URLs start `postgresql://`/`sqlite://` — unambiguous; try-decrypt is robust either way |
| Boot crash on decrypt failure                          | Medium     | High   | Fallback-to-SQLite + `undecryptable` flag (never raise out of the registry)                                 |
| Master-key loss locks a user out of their DB           | Medium     | High   | `undecryptable` flag + re-enter flow restores access (re-enter creds -> re-encrypt)                          |
| UI regression in Database Manager                       | Low        | Low    | Additive `undecryptable` field; existing flows unchanged; vitest coverage                                   |

## Open Questions

- [x] Approach A vs B vs C? -> **A** (whole-URL; matches F16, preserves contracts).
- [x] Scope: include cross-host portability? -> **No**, deferred to F19.
- [x] New master key or reuse F16's? -> **Reuse** (`get_master_key()`).
- [x] Plaintext upgrade: transparent or explicit command? -> **Transparent**.
- [x] Error UX when the *active* connection is undecryptable? -> **Persistent
      sidebar banner** while in fallback state (mirrors the `PromptsTab`
      offline-banner pattern, `PromptsTab.tsx:82-92`), plus the `ConnectionCard`
      amber flag. Surfaces "wrong DB" drift loudly instead of burying it in
      settings.

---
*Status: DRAFT — requirements + validated design. Implementation plan pending
via `/plan` (writing-plans).*
