# Cross-Host Master-Key Portability

```yaml
epic: EPIC-6
feature: F19
```

## Problem

F16 and F18 both rely on a single Fernet master key (`L1BR3_MASTER_KEY` env var
or auto-generated `~/.l1br3/master.key`) to wrap secrets at rest:

- `ai_providers.encrypted_api_key` (F16) — BYOK provider keys stored as rows in
  the user's DB.
- `~/.l1br3/databases.json` URLs (F18) — connection URLs for non-default engines.

When a user migrates their DB + `databases.json` to a host whose
`~/.l1br3/master.key` differs (the common case — the file is auto-generated per
install), every F16/F18 ciphertext becomes permanently undecryptable. Today the
only recovery is to re-enter every provider key and every DB credential by hand.
The user has no way to move their master key between machines.

## Evidence

- `docs/roadmap.md:205-210` — F19 entry: "migrating a DB to a host whose
  `~/.l1br3/master.key` differs leaves every BYOK key undecryptable. KDF
  (passphrase-derived key) or master-key export/import flow."
- `docs/prds/encrypted-db-credential-storage.prd.md:86-93` — F18 explicitly
  defers this portability gap to F19.
- `api/app/config.py:20-46` — `get_master_key()` precedence: env var > file
  (auto-generated). No portability surface exists.
- `api/app/services/security/crypto.py:13-19` — single lazy Fernet cached for
  process lifetime; key rotation mid-process is unsafe today.

## Users

- **Primary:** any user migrating their l1br3 data between hosts (new laptop,
  shared desktop, backup restore, dev↔prod DB cloning). Today this bricks every
  encrypted secret.
- **Secondary:** users who want to back up their master key for disaster
  recovery without exposing it as plaintext.
- **Not for:** users who want a passphrase-derived key replacing the
  random-key model (KDF approach) — that was the alternative F19 option,
  explicitly out of scope.

## Hypothesis

We believe **a passphrase-protected master-key export/import flow surfaced in
the Database Manager** will **eliminate the cross-host decrypt-brick failure
mode** for **any user migrating their DB between hosts**. We'll know we're right
when **an end-to-end test (encrypt a secret on host A, export key, import on
host B, decrypt) succeeds without re-entering any secret**, and **no existing
F16/F18 test regresses**.

## Success Metrics

| Metric                                            | Target              | How measured                                                                                          |
| ------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| Cross-host decrypt round-trip                     | 100%                | E2E test: encrypt under key A → export → import as key B → decrypt succeeds                           |
| Wrong-passphrase failure                           | Clean 400, no oracle | Integration test asserts no master-key bytes in error response                                        |
| Cache invalidation post-import                    | 100%                | Integration test: import calls `get_master_key()` afterward and asserts the new key is returned      |
| Plaintext master key in export file               | 0 bytes             | On-disk grep of exported bundle for raw key string fails                                              |
| Existing F16/F18 tests                            | 0 regressions       | `just test` both suites stay green                                                                    |
| Repo test coverage                                | >= 80% maintained   | `just test` + coverage report                                                                         |

## Scope

**In scope (Narrow)**

1. Pure-function crypto substrate for a versioned, passphrase-protected bundle
   format (`master_key_portability.py`): scrypt KDF + Fernet wrap of the master
   key. Random 16-byte salt per export; params hardcoded in the envelope for
   forward compatibility.
2. Three backend endpoints under `/api/v1/security/master-key/`:
   - `GET /status` → `{present, env_override}`.
   - `POST /export` → takes passphrase, returns the JSON bundle.
   - `POST /import` → takes passphrase + bundle JSON, writes
     `~/.l1br3/master.key` atomically (0600), and **clears both module caches**
     (`config._cached_master_key`, `crypto._fernet`) so the new key takes effect
     without an app restart.
3. Cache-invalidation helpers on `app.config` and `app.services.security.crypto`.
4. New "Master Key" panel in the existing Database Manager view (admin):
   status line + Export modal (passphrase + confirm) + Import modal (file picker
   + passphrase + overwrite warning when a key already exists).
5. Safety gates:
   - Wrong passphrase → 400 with deliberately ambiguous message (no oracle).
   - Unknown bundle version or malformed envelope → 400 before any crypto runs.
   - `L1BR3_MASTER_KEY` env override active on import → 409 (writing the file
     would have no effect).
   - Import overwriting an existing key → frontend confirmation dialog (backend
     permits the overwrite).

**Out of scope (deferred)**

- KDF / passphrase-derived master key replacing the random-key model (the other
  F19 option).
- Bundling `databases.json` or DB dumps in the export file — user copies these
  manually alongside the key.
- Re-keying existing F16/F18 ciphertext under a new master key.
- CLI subcommands (UI surface is the Database Manager panel).
- Master-key rotation utility.
- Source tracking (`generated` vs `imported` via sidecar metadata) — `status`
  surfaces only `present` + `env_override`.
- MySQL engine (still deferred from F17).

## Design

### Approach

**Passphrase-protected master-key file** — explicit export/import, no changes
to the at-rest model. F16/F18 ciphertext stays as-is; F19 makes the wrapping
key portable.

Chosen over KDF (which would require re-keying all existing ciphertext and a
boot-time passphrase prompt) and over a portable-secrets bundle (which would
re-encrypt every F16/F18 secret into a new envelope — the largest scope and
most failure-prone of the three).

### Bundle format (versioned JSON envelope)

```json
{
  "version": 1,
  "kdf": "scrypt",
  "salt": "<base64 16 random bytes>",
  "params": {"N": 16384, "r": 8, "p": 1},
  "ciphertext": "<Fernet token of master key string>"
}
```

- `version: 1` reserved for the initial scrypt+Fernet scheme; future KDF
  changes bump the version (old bundles stay readable).
- Salt is randomized per export so two exports of the same key under the same
  passphrase produce distinct ciphertexts.
- `params` are echoed in the envelope so importers know exactly what to apply
  (the version gate still forbids unknown combinations).

### Crypto details

- **scrypt** (`cryptography.hazmat.primitives.kdf.scrypt`) — already shipped by
  the `cryptography` dependency; no new deps. Memory-hard, GPU-resistant.
- Parameters `N=2^14, r=8, p=1` are a commonly-cited scrypt interactive
  baseline (suitable for user-chosen passphrases on a local-first app; the
  envelope echoes them so a future tightening can ship as `version: 2`).
- The derived 32-byte key is base64-encoded to construct a Fernet instance
  (`Fernet(base64.urlsafe_b64encode(derived))`), which wraps the master key
  string. Reuses the project's existing Fernet idiom rather than introducing
  raw AES-GCM.
- Wrong passphrase produces `InvalidToken` (Fernet's MAC check fails) — mapped
  to a `BundleError("wrong passphrase or corrupted file")` so error responses
  don't reveal which.

### Cache invalidation (load-bearing)

`app.config._cached_master_key` and `app.services.security.crypto._fernet` are
module globals cached for process lifetime. After a successful import, both
**must** be reset to `None` or subsequent decrypt calls silently use the old
key. New helpers:

- `app.config.clear_master_key_cache() -> str | None` (returns the previous
  value, useful for logging).
- `app.services.security.crypto.clear_fernet_cache() -> None`.

The import route calls both, then `get_master_key()` rehydrates from the newly
written file. Verified by an explicit integration test.

### Failure modes

| Situation                                  | Result                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Correct passphrase + valid bundle          | Write master key (0600, atomic temp+replace) → clear caches → 200                          |
| Wrong passphrase                           | `InvalidToken` → `BundleError` → 400 `"wrong passphrase or corrupted file"`               |
| Unknown bundle version                     | `BundleError` → 400 `"unsupported bundle version: N"`                                       |
| Malformed bundle (missing keys, bad b64)   | `BundleError` → 400 with specific reason (before any crypto runs)                          |
| `L1BR3_MASTER_KEY` env set during import   | 409 `"L1BR3_MASTER_KEY env var overrides the master.key file; unset it first"`             |
| `L1BR3_MASTER_KEY` env set during export   | 200 with `warning` field — exporting the env-derived key is unusual but not unsafe         |
| Overwriting existing master.key            | Frontend confirmation; backend permits the overwrite                                        |
| File write fails (disk full, perms)        | 500 with the OS error message                                                              |

### UI — Master Key panel in Database Manager

Inserted below the existing connections list in
`browser-ext/components/databases/DatabaseManager.tsx`. Compact, low-friction:

```
┌─ Master Key ──────────────────────────────────┐
│ Status: Present · file   /   Present · env override   /   Missing
│                                                │
│ [ Export master key… ]   [ Import master key… ]
└────────────────────────────────────────────────┘
```

- **Export modal:** passphrase input + confirm-passphrase input → "Download" →
  browser file save (`l1br3-master-key.json`). Includes a security warning
  ("store this file securely; it's protected only by your passphrase").
- **Import modal:** file picker → passphrase input → overwrite warning when
  `status.present === true` → "Import" → success state with "key updated; you
  may close this dialog".

Reuses the modal and API-call patterns already in `ConnectionEditModal` /
`MigrationModal`.

### Alternatives considered

- **B — KDF / passphrase-derived master key:** replace the random
  `master.key` with a passphrase-derived key (PBKDF2/scrypt/argon2). Rejected:
  requires re-keying every existing F16/F18 ciphertext, forces a boot-time
  passphrase prompt, and is the largest scope for the medium-complexity rating.
- **C — Portable secrets bundle:** gather every F16 key + F18 URL, decrypt
  in-process, re-encrypt under a passphrase-derived key into a single bundle
  file. Rejected: most new failure modes, drifts toward re-implementing the
  at-rest layer, and the chosen export/import approach achieves the same UX
  with smaller scope.

## Files

| File                                                              | Change                                                                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `api/app/services/security/master_key_portability.py` (new)         | `export_bundle`, `import_bundle`, `BundleError`, format constants (`BUNDLE_VERSION`, scrypt params) |
| `api/app/services/security/crypto.py`                              | Add `clear_fernet_cache() -> None`                                                                  |
| `api/app/config.py`                                                | Add `clear_master_key_cache() -> str \| None`                                                       |
| `api/app/schemas/security.py` (new)                                | `ExportRequest`, `ExportResponse`, `ImportRequest`, `ImportResult`, `MasterKeyStatus` Pydantic v2   |
| `api/app/routes/security.py` (new)                                 | `/master-key/status`, `/master-key/export`, `/master-key/import`; registers under `/api/v1/security` |
| `api/app/main.py`                                                  | Register the `security_router`                                                                      |
| `browser-ext/components/databases/MasterKeyPanel.tsx` (new)        | Status line + Export/Import buttons + modals                                                        |
| `browser-ext/components/databases/DatabaseManager.tsx`             | Render `<MasterKeyPanel />` below the connections list                                              |
| `browser-ext/components/databases/MasterKeyPanel.test.tsx` (new)   | Vitest coverage for status rendering + export/import flows                                          |
| `browser-ext/lib/api.ts`                                           | `getMasterKeyStatus`, `exportMasterKey`, `importMasterKey` helpers                                  |
| `browser-ext/types/index.ts`                                       | `MasterKeyStatus`, `MasterKeyBundle` types                                                          |
| `api/tests/test_master_key_portability.py` (new)                   | Pure-function unit tests (round-trip, wrong passphrase, version check, salt randomness, params echo) |
| `api/tests/test_security_routes.py` (new)                          | Route integration tests (status, export, import, cache invalidation, env-override refusal, overwrite) |

No DB migration required — F19 adds no new tables or columns.

## Testing strategy

**Pure-function unit tests (`test_master_key_portability.py`):**

- `test_round_trip_preserves_master_key` — `import_bundle(export_bundle(key, pw), pw) == key`.
- `test_wrong_passphrase_raises_bundle_error` — clean error, no master-key
  bytes in the message.
- `test_salt_is_random_per_export` — two exports produce different salts and
  different ciphertexts.
- `test_unknown_version_refused` — bumping `version` to 2 raises before crypto
  runs.
- `test_malformed_bundle_raises` — missing keys, bad base64, wrong types.
- `test_scrypt_params_in_bundle` — envelope echoes `N`/`r`/`p` for forward
  compatibility.

**Route integration tests (`test_security_routes.py`):**

- `GET /status` reflects file presence and env-override state.
- `POST /export` returns a bundle with the expected envelope shape; on-disk
  file grep finds no plaintext master key bytes.
- `POST /import` writes the key file (0600, atomic) and **clears caches** —
  verified by importing key A, then asserting `get_master_key() == A` (not the
  previously-cached pre-import key).
- `POST /import` with wrong passphrase → 400 with the ambiguous message.
- `POST /import` with `L1BR3_MASTER_KEY` env set → 409.
- `POST /import` overwriting an existing key → succeeds (frontend gates this).
- `POST /import` with malformed bundle → 400.
- `POST /export` with env override → 200 with `warning` field populated.

**Frontend tests (`MasterKeyPanel.test.tsx`):**

- Renders `Present · file` / `Present · env override` / `Missing` per status.
- Export flow: passphrase inputs match, mock `exportMasterKey`, success state,
  download trigger.
- Import flow: file picker, passphrase, overwrite warning rendered when
  `status.present === true`, mock `importMasterKey`, success state.

**Existing tests stay green** — no changes to `get_master_key()` precedence,
no changes to F16/F18 ciphertext format, no schema changes.

## Acceptance criteria (Definition of Done)

- [ ] User can export the master key to a passphrase-protected JSON file via
      Database Manager → Master Key panel.
- [ ] User can import that file on a new host (after copying the DB +
      `databases.json`), enter the passphrase, and all migrated F16 BYOK keys +
      F18 DB URLs decrypt correctly.
- [ ] Wrong passphrase produces a clean 400 with no oracle information.
- [ ] Unknown bundle version produces a clean 400 before any crypto runs.
- [ ] Import refuses with 409 when `L1BR3_MASTER_KEY` env var is set.
- [ ] Import warns before overwriting an existing `master.key` (frontend gate).
- [ ] Cache invalidation verified by integration test — post-import
      `get_master_key()` returns the imported key, not the stale cache.
- [ ] Exported bundle contains zero plaintext master-key bytes (on-disk grep
      test).
- [ ] `just test` (both suites), `just lint`, `cd api && uv run mypy app`,
      `pre-commit run --all-files`, and `just build` all pass.
- [ ] Roadmap: F19 → `- [x]`, Status Summary reconciled (EPIC-6 stays 100%).
- [ ] This PRD linked from the roadmap F19 entry.

## Risks

| Risk                                                                              | Likelihood | Impact | Mitigation                                                                                                                                  |
| --------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache invalidation missed → silent decrypt with stale key                         | Medium     | High   | Both module globals reset in the import route; covered by explicit integration test asserting `get_master_key()` returns the imported key   |
| User forgets passphrase → lost access to exported bundle                          | Medium     | High   | UX: confirm-passphrase field on export; PRD documents "there is no recovery"                                                                |
| User imports a wrong-host key over a working master.key → bricks local secrets    | Low        | High   | Frontend overwrite confirmation; status endpoint shows pre-import state so user can verify                                                   |
| scrypt `N=2^14` too slow on low-end hardware OR too weak for attackers            | Low        | Medium | `N` is hardcoded in the bundle; a future version bump can tighten it without breaking old bundles                                           |
| Bundle file lands in git/cloud unredacted                                         | Low        | High   | `detect-secrets` in pre-commit won't catch user-generated files; export modal carries an explicit "store securely" warning                  |
| PyInstaller-built binary mishandles the new router at runtime                     | Low        | Medium | `just build` is in the verify gate; if it fails the hidden-imports list (`api/build.sh`) is updated                                          |

## Open Questions

- [x] Approach: KDF, export/import, or hybrid bundle? → **Export/import**
      (smallest scope; preserves the at-rest model; matches the medium
      complexity rating).
- [x] UI surface: where does export/import live? → **Database Manager panel**
      (F19 lives next to F17/F18).
- [x] Bundle protection: scrypt, argon2, or plaintext? → **scrypt + Fernet**
      (no new deps; reuses existing crypto idiom; OWASP-baseline params).
- [x] Cache invalidation strategy? → **Both module globals reset in the import
      route**, verified by integration test.
- [x] Env-override-on-import behavior? → **Refuse (409)** — writing the file
      has no effect when env takes precedence.
- [x] Source tracking (`generated` vs `imported`)? → **Out of scope** — status
      reports `present` + `env_override` only.

---
*Status: DRAFT — requirements + validated design. Implementation plan pending
via the `writing-plans` skill.*
