# F18 — Encrypted DB Credential Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate plaintext DB connection URLs at rest by retrofitting F16's Fernet crypto onto `connection_store`, with transparent legacy upgrade, graceful boot fallback, and a sidebar banner surfacing the fallback state.

**Architecture:** Single encrypt/decrypt seam in `connection_store.py` wraps the existing `app.services.security.crypto.encrypt`/`decrypt` (same Fernet master key as F16 — no new env var). The stored `url` JSON field becomes a base64 Fernet token; reads decrypt transparently; legacy F17 plaintext records auto-upgrade on first load. A rotated/lost master key never crashes boot — the registry falls back to the zero-config SQLite default and flags the connection `undecryptable`, which the Read shape exposes and the sidebar banner surfaces.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy / `cryptography.fernet` (api); React / TanStack Query / vitest / Tailwind (browser-ext).

**Source PRD:** `docs/prds/encrypted-db-credential-storage.prd.md`

## Global Constraints

- **Python style:** 120 cols, double quotes, 4-space indent, `list[T]` over `List[T]`; `mypy --strict` clean (enforced in pre-commit).
- **TypeScript style:** printWidth 120, double quotes, no semicolons (`.prettierrc`); eslint clean.
- **Commits:** Conventional Commit format enforced by a `commit-msg` hook. Use scope `(api)` or `(ext)`. Never commit secrets.
- **Tests:** API via `cd api && uv run pytest ...`; extension via `cd browser-ext && pnpm test ...`.
- **Master key in tests:** `conftest.py:16` sets a deterministic `L1BR3_MASTER_KEY`. To simulate a rotated key, `monkeypatch.setenv("L1BR3_MASTER_KEY", <other>)` AND reset the cached singletons `app.config._cached_master_key = None` and `app.services.security.crypto._fernet = None` (see `api/tests/test_crypto.py:40-47`).
- **No DB migration needed:** `databases.json` is a file store, not a table. Legacy records upgrade in-place on load.

---

## File Structure

**Backend (`api/`)**
- `app/db/connection_store.py` — the entire encrypt/decrypt change surface. New `_decrypt_or_legacy`, `_upgrade_legacy`; encrypt-on-write in `_to_record` + `update_connection`; decrypt-on-read in `_parse_connections`; new `undecryptable` on `StoredConnection`; docstring retired.
- `app/db/engines/registry.py` — active-conn-undecryptable → fall back to `SqliteEngine.from_env()`; adds a module logger.
- `app/schemas/database.py` — add `undecryptable: bool = False` to `DatabaseConnectionRead`.
- `app/routes/databases.py` — `_to_read` propagates `undecryptable` and skips URL parsing for undecryptable connections.
- `app/db/engines/postgres.py` — drop the raw URL from `from_env`'s error message.
- `tests/test_connection_store.py`, `tests/test_db_engine.py`, `tests/test_db_engine_postgres.py`, `tests/test_database_routes.py` — new tests.

**Frontend (`browser-ext/`)**
- `types/index.ts` — add `undecryptable?: boolean` to `DatabaseConnectionRead`.
- `hooks/useActiveDatabase.ts` (new) — React Query hook exposing the active connection + `isUndecryptable`.
- `components/Sidebar.tsx` — persistent amber banner while the active connection is undecryptable.
- `components/databases/ConnectionCard.tsx` — amber "Undecryptable" badge (extends `Badge` with an `amber` tone).

**Root**
- `.gitignore` — `databases.json`, `*.key`.

---

## Task 1: Encrypt/decrypt seam in `connection_store` (core)

The whole at-rest change. Adds the crypto boundary, the legacy upgrade, the `undecryptable` flag, and the transparent F17→F18 migration. Existing `test_connection_store.py` tests stay green (encrypt/decrypt round-trips).

**Files:**
- Modify: `api/app/db/connection_store.py`
- Test: `api/tests/test_connection_store.py`

**Interfaces:**
- Consumes: `app.services.security.crypto.encrypt(plaintext: str) -> bytes`, `decrypt(token: bytes) -> str`; `cryptography.fernet.InvalidToken`.
- Produces: `StoredConnection.undecryptable: bool`; `list_connections()`/`get_connection()` now transparently decrypt and auto-upgrade legacy records on first load.

- [ ] **Step 1: Write the failing tests** (append to `api/tests/test_connection_store.py`)

```python
# Append at end of file. These exercise the F18 crypto boundary; existing
# tests above stay unchanged (encrypt/decrypt round-trips preserve their
# observable assertions).

import os

from app.services.security import crypto


def _reset_crypto_singletons(monkeypatch, new_key: str) -> None:
    """Simulate a rotated master key for the wrong-key tests."""
    import app.config

    monkeypatch.setenv("L1BR3_MASTER_KEY", new_key)
    # Force both caches to rebuild from the new env value.
    app.config._cached_master_key = None
    crypto._fernet = None


class TestEncryption:
    def test_url_encrypted_at_rest_and_0600(self, monkeypatch, tmp_path):
        import json
        import stat

        p = _set_path(monkeypatch, tmp_path)
        password = "supersecret"
        connection_store.add_connection(
            label="PG", engine="postgresql", url=f"postgresql://u:{password}@h:5432/db"
        )
        raw = p.read_text()
        # The password must not appear anywhere on disk...
        assert password not in raw
        # ...and the stored url is a Fernet token, not a plaintext URL.
        stored = json.loads(raw)["connections"][0]["url"]
        assert stored != f"postgresql://u:{password}@h:5432/db"
        assert "://" not in stored  # tokens are urlsafe-base64 (no '://')
        # 0600 perms preserved through the encrypt path.
        assert stat.S_IMODE(p.stat().st_mode) == 0o600

    def test_round_trip_preserves_url(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        url = "postgresql://u:p@h:5432/db"
        cid = connection_store.add_connection(label="PG", engine="postgresql", url=url)
        got = connection_store.get_connection(cid)
        assert got is not None
        assert got.url == url  # decrypt(round-trip) restores the plaintext URL
        assert got.undecryptable is False

    def test_legacy_plaintext_upgrades_transparently(self, monkeypatch, tmp_path):
        import json

        p = _set_path(monkeypatch, tmp_path)
        password = "supersecret"
        legacy_url = f"postgresql://u:{password}@h:5432/db"
        # Write an F17-shaped plaintext file (no encryption).
        p.write_text(
            json.dumps(
                {
                    "connections": [
                        {
                            "id": "legacy-1",
                            "label": "Legacy PG",
                            "engine": "postgresql",
                            "url": legacy_url,
                            "created_at": "2026-01-01T00:00:00+00:00",
                            "is_default": False,
                        }
                    ],
                    "active_id": "legacy-1",
                }
            )
        )

        conns = connection_store.list_connections()

        # The connection is usable (treated as legacy plaintext)...
        assert len(conns) == 1
        assert conns[0].url == legacy_url
        assert conns[0].undecryptable is False
        # ...and the file has been re-saved encrypted: no plaintext password remains.
        raw = json.loads(p.read_text())
        stored = raw["connections"][0]["url"]
        assert password not in p.read_text()
        assert "://" not in stored  # now a token

    def test_wrong_master_key_marks_undecryptable(self, monkeypatch, tmp_path):
        from cryptography.fernet import Fernet

        _set_path(monkeypatch, tmp_path)
        connection_store.add_connection(
            label="PG", engine="postgresql", url="postgresql://u:p@h:5432/db"
        )
        # Rotate the master key to something else and clear the cached singletons.
        _reset_crypto_singletons(monkeypatch, Fernet.generate_key().decode())

        conns = connection_store.list_connections()  # must NOT raise

        assert len(conns) == 1
        assert conns[0].undecryptable is True

    def test_update_reencrypts_url(self, monkeypatch, tmp_path):
        import json

        p = _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        updated = connection_store.update_connection(cid, url="sqlite:///y.db")
        assert updated is not None
        assert updated.url == "sqlite:///y.db"  # decrypt of the re-encrypted value
        # And the new plaintext is not sitting on disk.
        assert "sqlite:///y.db" not in p.read_text()
        stored = json.loads(p.read_text())
        rec = next(r for r in stored["connections"] if r["id"] == cid)
        assert "://" not in rec["url"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && uv run pytest tests/test_connection_store.py::TestEncryption -v`
Expected: FAIL — `test_url_encrypted_at_rest_and_0600` fails because the password is still plaintext on disk (no encryption yet); the others fail similarly.

- [ ] **Step 3: Implement the encrypt/decrypt seam**

Edit `api/app/db/connection_store.py`.

**3a. Update the module docstring (retire the M5 deferral note).** Replace lines 14-15:

```python
Credentials live in plaintext here for the M3 functional MVP; M5 retrofits
``app.services.security.crypto`` encryption onto the credential-bearing URL.
```

with:

```python
Credential-bearing URLs are encrypted at rest with ``app.services.security.crypto``
(F18), reusing the same Fernet master key as the BYOK provider keys (F16). Legacy
F17 plaintext records auto-upgrade on first load (``_upgrade_legacy``); a token
that won't decrypt under the current key (rotated ``L1BR3_MASTER_KEY``) is surfaced
as ``StoredConnection.undecryptable`` rather than crashing boot.
```

**3b. Add imports.** After the existing `from app.db.engines.sqlite import DEFAULT_DB_PATH` line (line 27), add:

```python
from cryptography.fernet import InvalidToken

from app.services.security.crypto import decrypt, encrypt
```

**3c. Add `undecryptable` to `StoredConnection`** (after `is_default: bool = False`):

```python
@dataclass(frozen=True)
class StoredConnection:
    id: str
    label: str
    engine: str
    url: str
    created_at: datetime
    is_default: bool = False
    undecryptable: bool = False
```

**3d. Add `_decrypt_or_legacy` and `_upgrade_legacy`.** Insert immediately before the `# ── record <-> dataclass ──` section comment (before `_to_record`):

```python
# ── credential encryption (F18) ──────────────────────────────────────────────


def _decrypt_or_legacy(value: str) -> tuple[str, bool]:
    """Return ``(url, undecryptable)`` for a stored url field.

    F18 stores urls as Fernet tokens (urlsafe-base64, which contains no ``:``).
    F17 installs stored plaintext URLs (``scheme://...``). ``InvalidToken`` cannot
    distinguish a legacy plaintext URL from a token encrypted under a different
    (rotated) master key, so the ``://`` discriminator does: a value containing
    ``://`` is legacy plaintext (upgraded on the next save by ``_upgrade_legacy``);
    a token-shaped value that won't decrypt is genuinely undecryptable.
    """
    try:
        return decrypt(value.encode()), False
    except InvalidToken:
        if "://" in value:
            return value, False  # legacy plaintext URL (F17)
        return "", True  # encrypted token we can't decrypt
    except Exception:
        return "", True


def _upgrade_legacy(raw: dict[str, Any]) -> None:
    """Re-encrypt legacy plaintext URLs (F17) in place; best-effort persist.

    A record whose ``url`` still contains ``://`` is a plaintext F17 value —
    encrypt it so the file contains no plaintext credentials after first load.
    The save is best-effort: a write failure is logged but never breaks reads
    (the in-memory value is still usable for this process).
    """
    changed = False
    for record in raw.get("connections", []):
        if (
            isinstance(record, dict)
            and isinstance(record.get("url"), str)
            and "://" in record["url"]
        ):
            record["url"] = encrypt(record["url"]).decode()
            changed = True
    if changed:
        try:
            _save(raw)
        except OSError as exc:
            logger.warning("Failed to persist credential upgrade (%s); continuing.", exc)
```

**3e. Encrypt on write in `_to_record`:**

```python
def _to_record(conn: StoredConnection) -> dict[str, Any]:
    return {
        "id": conn.id,
        "label": conn.label,
        "engine": conn.engine,
        "url": encrypt(conn.url).decode(),
        "created_at": conn.created_at.isoformat(),
        "is_default": conn.is_default,
    }
```

**3f. Decrypt on read in `_parse_connections`** — replace the `url=str(item["url"])` construction with the helper, and pass `undecryptable`:

```python
def _parse_connections(raw: dict[str, Any]) -> list[StoredConnection]:
    conns: list[StoredConnection] = []
    for item in raw.get("connections", []):
        if not isinstance(item, dict):
            continue
        try:
            url, undecryptable = _decrypt_or_legacy(str(item["url"]))
            conns.append(
                StoredConnection(
                    id=str(item["id"]),
                    label=str(item["label"]),
                    engine=str(item["engine"]),
                    url=url,
                    created_at=datetime.fromisoformat(str(item["created_at"])),
                    is_default=bool(item.get("is_default", False)),
                    undecryptable=undecryptable,
                )
            )
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Skipping malformed connection record: %s", exc)
    return conns
```

**3g. Route `list_connections` through the upgrade.** Replace the body of `list_connections`:

```python
def list_connections() -> list[StoredConnection]:
    return _parse_connections(_load_or_seed())
```

**3h. Run the upgrade from `_load_or_seed`:**

```python
def _load_or_seed() -> dict[str, Any]:
    raw = _read_file()
    if raw is None:
        return _seed_data()
    _upgrade_legacy(raw)
    return raw
```

**3i. Encrypt in `update_connection`.** Change the `if url is not None:` branch:

```python
            if url is not None:
                record["url"] = encrypt(url).decode()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && uv run pytest tests/test_connection_store.py -v`
Expected: PASS — all new `TestEncryption` tests green AND the existing `TestSeed`/`TestCRUD`/`TestActive`/`TestPersistence` tests still green (encrypt/decrypt round-trips preserve their observable assertions).

- [ ] **Step 5: Lint + typecheck**

Run: `cd api && uv run ruff check app/db/connection_store.py && uv run mypy app/db/connection_store.py`
Expected: clean (ruff 0 new errors; mypy --strict passes — `_decrypt_or_legacy` returns `tuple[str, bool]`, fully typed).

- [ ] **Step 6: Commit**

```bash
git add api/app/db/connection_store.py api/tests/test_connection_store.py
git commit -m "feat(api): encrypt DB connection URLs at rest in connection_store (F18)"
```

---

## Task 2: Expose `undecryptable` in the Read shape

The Read schema gains `undecryptable`; `_to_read` propagates it and avoids parsing a garbage URL for undecryptable connections.

**Files:**
- Modify: `api/app/schemas/database.py`
- Modify: `api/app/routes/databases.py` (`_to_read`)
- Test: `api/tests/test_database_routes.py`

**Interfaces:**
- Consumes: `StoredConnection.undecryptable` (Task 1).
- Produces: `DatabaseConnectionRead.undecryptable: bool`; `_to_read` returns `masked_url="***"`, `has_password=False`, host/port/database `None` for undecryptable connections.

- [ ] **Step 1: Write the failing test** (append to `api/tests/test_database_routes.py`)

```python
def test_read_surfaces_undecryptable_flag(client, monkeypatch, tmp_path):
    import json

    from cryptography.fernet import Fernet

    p = tmp_path / "databases.json"
    monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(p))
    # Encrypt under a DIFFERENT key than the conftest master key → undecryptable.
    other = Fernet(Fernet.generate_key())
    token = other.encrypt(b"postgresql://u:supersecret@h:5432/db").decode()
    p.write_text(
        json.dumps(
            {
                "connections": [
                    {
                        "id": "x",
                        "label": "Prod",
                        "engine": "postgresql",
                        "url": token,
                        "created_at": "2026-01-01T00:00:00+00:00",
                        "is_default": False,
                    }
                ],
                "active_id": "x",
            }
        )
    )

    res = client.get("/api/v1/databases")
    assert res.status_code == 200
    conn = res.json()["data"][0]
    assert conn["undecryptable"] is True
    # No secret leakage through the masked url / password flag.
    assert "supersecret" not in res.text
    assert conn["maskedUrl"] == "***"
    assert conn["hasPassword"] is False
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && uv run pytest tests/test_database_routes.py::test_read_surfaces_undecryptable_flag -v`
Expected: FAIL — `KeyError: 'undecryptable'` (or `assert conn["undecryptable"] is True` fails because the field is absent).

- [ ] **Step 3: Add the field to `DatabaseConnectionRead`** (`api/app/schemas/database.py`). Insert after `is_default: bool = False`:

```python
    undecryptable: bool = False
```

- [ ] **Step 4: Propagate in `_to_read`** (`api/app/routes/databases.py`). Replace the body of `_to_read` (lines 42-69) with:

```python
def _to_read(conn: connection_store.StoredConnection, active_id: str | None = None) -> DatabaseConnectionRead:
    """Convert a stored connection to the credential-free Read shape.

    ``active_id`` is passed in by list handlers (computed once) to avoid an
    N-fold file re-read; single-connection handlers leave it None.
    """
    if active_id is None:
        active_id = connection_store.get_active_id()
    effective_active = active_id if active_id else connection_store.DEFAULT_CONNECTION_ID
    if conn.undecryptable:
        # The url can't be decrypted — surface the flag without parsing garbage
        # or echoing any secret material.
        return DatabaseConnectionRead(
            id=conn.id,
            label=conn.label,
            engine=conn.engine,
            has_password=False,
            host=None,
            port=None,
            database=None,
            masked_url="***",
            is_active=effective_active == conn.id,
            is_default=conn.is_default,
            undecryptable=True,
        )
    try:
        u = make_url(conn.url)
        host, port, database = u.host, u.port, u.database
    except Exception:
        host = port = database = None
    return DatabaseConnectionRead(
        id=conn.id,
        label=conn.label,
        engine=conn.engine,
        has_password=url_has_password(conn.url),
        host=host,
        port=port,
        database=database,
        masked_url=redact_url(conn.url),
        is_active=effective_active == conn.id,
        is_default=conn.is_default,
        undecryptable=False,
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd api && uv run pytest tests/test_database_routes.py -v`
Expected: PASS — new test green; existing `TestReadSchemaNeverLeaksSecrets` and leak tests still green (the Read shape is observably identical for healthy connections).

- [ ] **Step 6: Lint + typecheck + commit**

```bash
cd api && uv run ruff check app/schemas/database.py app/routes/databases.py && uv run mypy app/schemas/database.py app/routes/databases.py
git add api/app/schemas/database.py api/app/routes/databases.py api/tests/test_database_routes.py
git commit -m "feat(api): expose undecryptable flag in DatabaseConnectionRead (F18)"
```

---

## Task 3: Registry fallback when the active connection is undecryptable

The registry consults the store at boot; a decrypt failure there must not crash startup. Fall back to the zero-config SQLite default and log a warning.

**Files:**
- Modify: `api/app/db/engines/registry.py`
- Test: `api/tests/test_db_engine.py`

**Interfaces:**
- Consumes: `StoredConnection.undecryptable` (Task 1).
- Produces: `_resolve_engine()` returns `SqliteEngine.from_env()` (instead of raising) when the active connection is undecryptable.

- [ ] **Step 1: Write the failing test** (append to `api/tests/test_db_engine.py`)

```python
def test_active_undecryptable_falls_back_to_sqlite(monkeypatch, tmp_path):
    import json

    from cryptography.fernet import Fernet

    from app.db import connection_store
    from app.db.engines.registry import _resolve_engine, set_active_engine
    from app.db.engines.sqlite import SqliteEngine

    p = tmp_path / "databases.json"
    monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(p))
    other = Fernet(Fernet.generate_key())
    token = other.encrypt(b"postgresql://u:p@h:5432/db").decode()
    p.write_text(
        json.dumps(
            {
                "connections": [
                    {
                        "id": "x",
                        "label": "Prod",
                        "engine": "postgresql",
                        "url": token,
                        "created_at": "2026-01-01T00:00:00+00:00",
                        "is_default": False,
                    }
                ],
                "active_id": "x",
            }
        )
    )
    set_active_engine(None)  # clear the cached singleton

    engine = _resolve_engine()  # must NOT raise

    assert isinstance(engine, SqliteEngine)
    set_active_engine(None)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && uv run pytest tests/test_db_engine.py::test_active_undecryptable_falls_back_to_sqlite -v`
Expected: FAIL — currently `_resolve_engine` calls `build_engine_for_url(conn.url)` with `conn.url == ""`, which builds a broken `SqliteEngine("")` (or otherwise misbehaves rather than returning the `from_env()` default).

- [ ] **Step 3: Implement the fallback** (`api/app/db/engines/registry.py`).

Add a logger + `logging` import after the existing `import os` (line 21):

```python
import logging
import os

from app.db import connection_store
from app.db.engines.base import DatabaseEngine
from app.db.engines.postgres import PostgresEngine
from app.db.engines.sqlite import SqliteEngine

logger = logging.getLogger(__name__)

_active_engine: DatabaseEngine | None = None
```

Replace the active-connection block in `_resolve_engine` (lines 43-47) with:

```python
    active_id = connection_store.get_active_id()
    if active_id is not None:
        conn = connection_store.get_connection(active_id)
        if conn is not None:
            if conn.undecryptable:
                logger.warning(
                    "Active database connection %s is undecryptable (rotated "
                    "L1BR3_MASTER_KEY?); falling back to the SQLite default.",
                    active_id,
                )
                return SqliteEngine.from_env()
            return build_engine_for_url(conn.url)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && uv run pytest tests/test_db_engine.py -v`
Expected: PASS — new test green; existing registry-precedence tests still green (the store-active tier still wins for healthy connections).

- [ ] **Step 5: Lint + typecheck + commit**

```bash
cd api && uv run ruff check app/db/engines/registry.py && uv run mypy app/db/engines/registry.py
git add api/app/db/engines/registry.py api/tests/test_db_engine.py
git commit -m "fix(api): fall back to SQLite when active DB connection is undecryptable (F18)"
```

---

## Task 4: Neutralize the `from_env` URL-echo + gitignore runtime secrets

A latent leak tripwire: `PostgresEngine.from_env` interpolates the raw URL into its error message. Not currently user-reachable, but F18 closes it. Plus defense-in-depth `.gitignore` entries.

**Files:**
- Modify: `api/app/db/engines/postgres.py`
- Modify: `.gitignore`
- Test: `api/tests/test_db_engine_postgres.py`

- [ ] **Step 1: Write the failing test** (append to `api/tests/test_db_engine_postgres.py`)

```python
def test_from_env_rejects_non_postgres_without_echoing_url(monkeypatch):
    import pytest

    from app.db.engines.postgres import PostgresEngine

    secret = "postgresql://u:supersecret@host/db"
    monkeypatch.setenv("L1BR3_DATABASE_URL", secret)
    with pytest.raises(ValueError) as exc:
        PostgresEngine.from_env()
    msg = str(exc.value)
    assert "supersecret" not in msg
    assert secret not in msg
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && uv run pytest tests/test_db_engine_postgres.py::test_from_env_rejects_non_postgres_without_echoing_url -v`
Expected: FAIL — the current message interpolates `url!r`, so `"supersecret"` appears in `str(exc.value)`.

- [ ] **Step 3: Drop the URL from the error** (`api/app/db/engines/postgres.py`, lines 142-146). Replace:

```python
        if not url.startswith("postgresql"):
            raise ValueError(
                f"PostgresEngine requires a PostgreSQL URL (L1BR3_DATABASE_URL={url!r}); "
                "use SqliteEngine for sqlite:// URLs."
            )
```

with:

```python
        if not url.startswith("postgresql"):
            raise ValueError(
                "PostgresEngine requires a PostgreSQL URL; use SqliteEngine for sqlite:// URLs."
            )
```

Also update the stale config note in the module docstring (lines 12-13). Replace:

```
Config: ``L1BR3_DATABASE_URL`` env only (M2) — no settings UI until M3, no
encrypted credential storage until M5.
```

with:

```
Config: ``L1BR3_DATABASE_URL`` env, or the Database Manager (M3). DB URLs are
encrypted at rest by ``connection_store`` (F18).
```

- [ ] **Step 4: Add `.gitignore` entries.** Append to `.gitignore` (after the `# Logs` block):

```gitignore

# l1br3 runtime secrets (live under ~/.l1br3; guard against a path pointed into the repo)
databases.json
*.key
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd api && uv run pytest tests/test_db_engine_postgres.py -v`
Expected: PASS.

- [ ] **Step 6: Lint + typecheck + commit**

```bash
cd api && uv run ruff check app/db/engines/postgres.py && uv run mypy app/db/engines/postgres.py
git add api/app/db/engines/postgres.py .gitignore api/tests/test_db_engine_postgres.py
git commit -m "fix(api): stop echoing DB URL in PostgresEngine.from_env error; gitignore runtime secrets (F18)"
```

---

## Task 5: Frontend `undecryptable` type + `useActiveDatabase` hook

The data layer for the sidebar banner: a typed `undecryptable` field and a React Query hook that exposes the active connection + an `isUndecryptable` flag.

**Files:**
- Modify: `browser-ext/types/index.ts`
- Create: `browser-ext/hooks/useActiveDatabase.ts`
- Test: `browser-ext/hooks/useActiveDatabase.test.ts`

**Interfaces:**
- Consumes: `listDatabases(baseUrl)` from `lib/api`; `useAppConfig().config.backend.{url,isInstalled}`.
- Produces: `useActiveDatabase() -> { activeConnection: DatabaseConnectionRead | null; isUndecryptable: boolean; isLoading: boolean }`.

- [ ] **Step 1: Add the type field** (`browser-ext/types/index.ts`). Add `undecryptable?: boolean` to `DatabaseConnectionRead` (after `isDefault`):

```typescript
export interface DatabaseConnectionRead {
  id: string
  label: string
  engine: DbEngine
  hasPassword: boolean
  host: string | null
  port: number | null
  database: string | null
  maskedUrl: string
  isActive: boolean
  isDefault: boolean
  undecryptable?: boolean
}
```

- [ ] **Step 2: Write the failing hook test** (`browser-ext/hooks/useActiveDatabase.test.ts`)

```typescript
import React from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { vi, describe, it, expect, beforeEach } from "vitest"
import type { AppConfig } from "../contexts/AppConfig"
import type { DatabaseConnectionRead } from "../types"

vi.mock("../contexts/AppConfig", () => ({ useAppConfig: vi.fn() }))
vi.mock("../lib/api", () => ({ listDatabases: vi.fn() }))

import { useAppConfig } from "../contexts/AppConfig"
import { listDatabases } from "../lib/api"
import { useActiveDatabase } from "./useActiveDatabase"

const mockConfig: AppConfig = {
  backend: { isInstalled: true, url: "http://localhost:8000" },
  ai: {
    localConnected: false,
    activeProvider: null,
    selectedModel: null,
    availableModels: [],
    providers: [],
    assignments: { chat: null, transform: null },
  },
  viewMode: "sidebar",
  quickActions: [],
}

const baseCtx = {
  config: mockConfig,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  updateAi: vi.fn(),
  activeTab: "compose" as const,
  setActiveTab: vi.fn(),
  editingPrompt: null,
  setEditingPrompt: vi.fn(),
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children)
}

const undecryptable: DatabaseConnectionRead = {
  id: "x",
  label: "Prod",
  engine: "postgresql",
  hasPassword: true,
  host: "h",
  port: 5432,
  database: "db",
  maskedUrl: "postgresql://u:***@h:5432/db",
  isActive: true,
  isDefault: false,
  undecryptable: true,
}
const healthy: DatabaseConnectionRead = { ...undecryptable, undecryptable: false }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAppConfig).mockReturnValue(baseCtx as unknown as ReturnType<typeof useAppConfig>)
})

describe("useActiveDatabase", () => {
  it("isUndecryptable is true when the active connection is flagged", async () => {
    vi.mocked(listDatabases).mockResolvedValue([undecryptable])
    const { result } = renderHook(() => useActiveDatabase(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isUndecryptable).toBe(true))
    expect(result.current.activeConnection?.label).toBe("Prod")
  })

  it("isUndecryptable is false when the active connection is healthy", async () => {
    vi.mocked(listDatabases).mockResolvedValue([healthy])
    const { result } = renderHook(() => useActiveDatabase(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isUndecryptable).toBe(false))
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd browser-ext && pnpm test useActiveDatabase`
Expected: FAIL — `Cannot find module './useActiveDatabase'` (or `../hooks/useActiveDatabase`).

- [ ] **Step 4: Implement the hook** (`browser-ext/hooks/useActiveDatabase.ts`)

```typescript
import { useQuery } from "@tanstack/react-query"
import { useAppConfig } from "../contexts/AppConfig"
import { listDatabases } from "../lib/api"
import type { DatabaseConnectionRead } from "../types"

export interface UseActiveDatabaseReturn {
  activeConnection: DatabaseConnectionRead | null
  /** True when the active connection's URL can't be decrypted (rotated master key). */
  isUndecryptable: boolean
  isLoading: boolean
}

/**
 * Resolves the active database connection + its decrypt status, for the sidebar
 * fallback banner. Mirrors the `usePrompts` React Query pattern.
 */
export function useActiveDatabase(): UseActiveDatabaseReturn {
  const { config } = useAppConfig()
  const backendUrl = config.backend.url

  const query = useQuery({
    queryKey: ["databases", "active"],
    queryFn: async () => listDatabases(backendUrl),
    enabled: config.backend.isInstalled,
  })

  const activeConnection = query.data?.find((c) => c.isActive) ?? null
  return {
    activeConnection,
    isUndecryptable: activeConnection?.undecryptable === true,
    isLoading: query.isLoading,
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd browser-ext && pnpm test useActiveDatabase`
Expected: PASS.

- [ ] **Step 6: Lint + typecheck + commit**

```bash
cd browser-ext && pnpm run lint && npx tsc --noEmit
git add browser-ext/types/index.ts browser-ext/hooks/useActiveDatabase.ts browser-ext/hooks/useActiveDatabase.test.ts
git commit -m "feat(ext): add useActiveDatabase hook + undecryptable type (F18)"
```

---

## Task 6: Sidebar banner + ConnectionCard undecryptable flag

The presentation layer: a persistent amber banner in the sidebar shell while the active connection is undecryptable, and an "Undecryptable" badge on the connection card.

**Files:**
- Modify: `browser-ext/components/databases/ConnectionCard.tsx`
- Modify: `browser-ext/components/Sidebar.tsx`
- Create: `browser-ext/components/databases/ConnectionCard.test.tsx`
- Create: `browser-ext/components/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `useActiveDatabase()` (Task 5); `connection.undecryptable` on `DatabaseConnectionRead`.

- [ ] **Step 1: Write the failing ConnectionCard test** (`browser-ext/components/databases/ConnectionCard.test.tsx`)

```typescript
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConnectionCard } from "./ConnectionCard"
import { ENGINE_META } from "./engineMeta"
import type { DatabaseConnectionRead } from "../../types"

const base: DatabaseConnectionRead = {
  id: "x",
  label: "Prod",
  engine: "postgresql",
  hasPassword: true,
  host: "h",
  port: 5432,
  database: "db",
  maskedUrl: "postgresql://u:***@h:5432/db",
  isActive: false,
  isDefault: false,
}

describe("ConnectionCard — undecryptable flag", () => {
  it("shows an Undecryptable badge when connection.undecryptable is true", () => {
    render(<ConnectionCard meta={ENGINE_META.postgresql} connection={{ ...base, undecryptable: true }} />)
    expect(screen.getByText(/undecryptable/i)).toBeTruthy()
  })

  it("does not show the badge when undecryptable is absent", () => {
    render(<ConnectionCard meta={ENGINE_META.postgresql} connection={base} />)
    expect(screen.queryByText(/undecryptable/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Write the failing Sidebar test** (`browser-ext/components/Sidebar.test.tsx`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("../hooks/useBackendHealth", () => ({ useBackendHealth: vi.fn() }))
vi.mock("../contexts/AppConfig", () => ({ useAppConfig: vi.fn() }))
vi.mock("../hooks/useActiveDatabase", () => ({ useActiveDatabase: vi.fn() }))
vi.mock("./PromptsTab", () => ({ PromptsTab: () => null }))
vi.mock("./ComposeTab", () => ({ ComposeTab: () => null }))
vi.mock("./SettingsTab", () => ({ SettingsTab: () => null }))
vi.mock("./StatusBar", () => ({ StatusBar: () => null }))

import { useAppConfig } from "../contexts/AppConfig"
import { useActiveDatabase } from "../hooks/useActiveDatabase"
import { Sidebar } from "./Sidebar"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAppConfig).mockReturnValue({
    activeTab: "compose",
    setActiveTab: vi.fn(),
  } as unknown as ReturnType<typeof useAppConfig>)
})

describe("Sidebar — undecryptable fallback banner", () => {
  it("shows the banner when the active database is undecryptable", () => {
    vi.mocked(useActiveDatabase).mockReturnValue({
      activeConnection: { label: "Prod" } as never,
      isUndecryptable: true,
      isLoading: false,
    })
    render(<Sidebar />)
    expect(screen.getByText(/couldn't be decrypted/i)).toBeTruthy()
    expect(screen.getByText(/Prod/)).toBeTruthy()
  })

  it("hides the banner when the active database is healthy", () => {
    vi.mocked(useActiveDatabase).mockReturnValue({
      activeConnection: null,
      isUndecryptable: false,
      isLoading: false,
    })
    render(<Sidebar />)
    expect(screen.queryByText(/couldn't be decrypted/i)).toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd browser-ext && pnpm test "(ConnectionCard|Sidebar)" `
Expected: FAIL — `ConnectionCard` renders no Undecryptable badge; `Sidebar` renders no banner text.

- [ ] **Step 4: Add the `amber` Badge tone + undecryptable badge** (`browser-ext/components/databases/ConnectionCard.tsx`).

Extend the `Badge` tone type + map (line 19-24):

```typescript
function Badge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: "emerald" | "indigo" | "slate" | "amber"
}) {
  const tones = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    indigo: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    slate: "bg-slate-900 text-slate-500 border-slate-800",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
```

Add `AlertTriangle` to the lucide-react import (line 2):

```typescript
import { AlertTriangle, CheckCircle2, Database, KeyRound, Pencil, Trash2, Zap } from "lucide-react"
```

Render the badge in the header badge cluster (after the `isActive` badge, around line 60):

```typescript
            {connection.undecryptable && (
              <Badge tone="amber">
                <AlertTriangle size={9} /> Undecryptable
              </Badge>
            )}
```

- [ ] **Step 5: Add the sidebar banner** (`browser-ext/components/Sidebar.tsx`).

Extend the lucide-react import to include `AlertTriangle`, and add the hook import:

```typescript
import { AlertTriangle, PenLine, Settings, TerminalSquare } from "lucide-react"
import { useActiveDatabase } from "../hooks/useActiveDatabase"
```

In the component body, after `useBackendHealth()` / the `useAppConfig()` destructure, add:

```typescript
  const { isUndecryptable, activeConnection } = useActiveDatabase()
```

Render the banner between the header `</div>` (line 88) and the `{/* Main Content Area */}` comment (line 90):

```typescript
        {/* F18: persistent banner while the active DB connection is undecryptable. */}
        {isUndecryptable && activeConnection && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-300 leading-relaxed">
              Database &ldquo;{activeConnection.label}&rdquo; couldn&apos;t be decrypted &mdash; fell
              back to local SQLite. Re-enter its credentials in Databases.
            </p>
          </div>
        )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd browser-ext && pnpm test "(ConnectionCard|Sidebar)"`
Expected: PASS.

- [ ] **Step 7: Lint + typecheck + commit**

```bash
cd browser-ext && pnpm run lint && npx tsc --noEmit
git add browser-ext/components/databases/ConnectionCard.tsx browser-ext/components/databases/ConnectionCard.test.tsx browser-ext/components/Sidebar.tsx browser-ext/components/Sidebar.test.tsx
git commit -m "feat(ext): surface undecryptable DB fallback in sidebar banner + connection card (F18)"
```

---

## Final verification (the `/verify` gate)

Before claiming F18 complete, run the full gate from the repo root. All must pass:

```bash
# Both test suites
just test

# tsc + ruff (fast gate)
just lint

# The complete gate: mypy --strict, eslint, prettier, ruff fix+format, detect-secrets
pre-commit run --all-files

# Build (Chrome ext must emit admin.html + sidepanel.html; API PyInstaller)
just build
```

Then `/checkpoint` to mutate the roadmap: F18 `- [ ]` → `- [x]`, Status Summary EPIC-6 → 100%, link the PRD next to F18. F19 stays pending.

---

## Self-Review

**1. Spec coverage** — PRD acceptance criteria vs tasks:
- "zero plaintext DB URLs after any write" → Task 1 (`test_url_encrypted_at_rest_and_0600`, `test_update_reencrypts_url`). ✓
- "F17 plaintext installs auto-upgrade silently on first load" → Task 1 (`test_legacy_plaintext_upgrades_transparently`). ✓
- "rotated/lost master key never crashes boot — falls back to SQLite + flags undecryptable" → Task 1 (`test_wrong_master_key_marks_undecryptable`), Task 3 (`test_active_undecryptable_falls_back_to_sqlite`). ✓
- "no new secret-leak vectors; `from_env` no longer echoes the URL" → Task 4. ✓
- "persistent sidebar banner makes the fallback state visible" → Task 6. ✓
- "`just test` + `just lint` + `pre-commit run --all-files` + `just build`" → Final verification. ✓
- "Roadmap F18 → [x], EPIC-6 → 100%; F19 tracked" → handled at `/checkpoint`, not a code task. ✓

**2. Placeholder scan** — every code step shows complete code; every command shows expected output. No "TBD"/"add error handling"/"similar to Task N". The one `as never` in the Sidebar test is a deliberate vitest mock cast, not a placeholder.

**3. Type consistency** — `StoredConnection.undecryptable` (Task 1) ↔ `_to_read` `undecryptable=` (Task 2) ↔ `DatabaseConnectionRead.undecryptable` (Task 2) ↔ TS `undecryptable?` (Task 5) ↔ `useActiveDatabase().isUndecryptable` (Task 5) ↔ Sidebar/ConnectionCard consumers (Task 6). Names consistent across the stack. `_decrypt_or_legacy` returns `tuple[str, bool]` in both definition (Task 1) and use. `useActiveDatabase` return shape matches both its test (Task 5) and the Sidebar mock (Task 6).
