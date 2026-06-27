"""File-backed store of user-configured database connections + the active id.

Persists to ``~/.l1br3/databases.json`` (0600; path overridable via
``L1BR3_DATABASES_CONFIG``). The canonical connection value is a SQLAlchemy URL
string — exactly what the engine consumes — so there is no stored/runtime
representation skew.

File-backed (not a DB table) on purpose: connection configs cannot live in the
DB they describe (when the active DB is Postgres, sessions yield Postgres rows),
and the API must know which DB to connect to *before* opening any connection.
The file is read before any DB is touched. This mirrors the file-based
``master.key`` pattern in ``app.config``.

Credential-bearing URLs are encrypted at rest with ``app.services.security.crypto``
(F18), reusing the same Fernet master key as the BYOK provider keys (F16). Legacy
F17 plaintext records auto-upgrade on first load (``_upgrade_legacy``); a token
that won't decrypt under the current key (rotated ``L1BR3_MASTER_KEY``) is surfaced
as ``StoredConnection.undecryptable`` rather than crashing boot.
"""

import json
import logging
import os
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.fernet import InvalidToken

from app.db.engines.sqlite import DEFAULT_DB_PATH
from app.services.security.crypto import decrypt, encrypt

logger = logging.getLogger(__name__)

DEFAULT_CONNECTION_ID = "00000000-0000-0000-0000-000000000001"

_CONFIG_FILENAME = "databases.json"


@dataclass(frozen=True)
class StoredConnection:
    id: str
    label: str
    engine: str
    url: str
    created_at: datetime
    is_default: bool = False
    undecryptable: bool = False


# ── path + low-level file I/O ────────────────────────────────────────────────


def _config_path() -> Path:
    env = os.environ.get("L1BR3_DATABASES_CONFIG")
    if env:
        return Path(env)
    return Path.home() / ".l1br3" / _CONFIG_FILENAME


def _read_file() -> dict[str, Any] | None:
    """Return the parsed config, or None if missing/malformed.

    None (never an exception) so callers — especially the registry at boot —
    can fall through cleanly. A malformed file is logged and treated as missing
    rather than crashing the app.
    """
    path = _config_path()
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Database config %s is unreadable (%s); ignoring.", path, exc)
        return None
    if not isinstance(raw, dict) or not isinstance(raw.get("connections"), list):
        logger.warning("Database config %s has an invalid shape; ignoring.", path)
        return None
    return raw


def _save(data: dict[str, Any]) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / (path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, path)
    try:
        path.chmod(0o600)
    except OSError:
        # Filesystem may not support chmod (e.g. some Windows mounts); non-fatal.
        pass


# ── default / seeding ────────────────────────────────────────────────────────


def _default_connection() -> StoredConnection:
    return StoredConnection(
        id=DEFAULT_CONNECTION_ID,
        label="Default SQLite",
        engine="sqlite",
        url=f"sqlite:///{DEFAULT_DB_PATH}",
        created_at=datetime.now(UTC),
        is_default=True,
    )


def _seed_data() -> dict[str, Any]:
    default = _default_connection()
    return {
        "connections": [_to_record(default)],
        "active_id": default.id,
    }


def _load_or_seed() -> dict[str, Any]:
    raw = _read_file()
    if raw is None:
        return _seed_data()
    _upgrade_legacy(raw)
    return raw


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
        if isinstance(record, dict) and isinstance(record.get("url"), str) and "://" in record["url"]:
            record["url"] = encrypt(record["url"]).decode()
            changed = True
    if changed:
        try:
            _save(raw)
        except OSError as exc:
            logger.warning("Failed to persist credential upgrade (%s); continuing.", exc)


# ── record <-> dataclass ─────────────────────────────────────────────────────


def _to_record(conn: StoredConnection) -> dict[str, Any]:
    return {
        "id": conn.id,
        "label": conn.label,
        "engine": conn.engine,
        "url": encrypt(conn.url).decode(),
        "created_at": conn.created_at.isoformat(),
        "is_default": conn.is_default,
    }


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


# ── public API ───────────────────────────────────────────────────────────────


def list_connections() -> list[StoredConnection]:
    return _parse_connections(_load_or_seed())


def get_connection(id: str) -> StoredConnection | None:
    for conn in list_connections():
        if conn.id == id:
            return conn
    return None


def add_connection(*, label: str, engine: str, url: str) -> str:
    data = _load_or_seed()
    conn = StoredConnection(
        id=str(uuid.uuid4()),
        label=label,
        engine=engine,
        url=url,
        created_at=datetime.now(UTC),
        is_default=False,
    )
    data["connections"].append(_to_record(conn))
    _save(data)
    return conn.id


def update_connection(id: str, *, label: str | None = None, url: str | None = None) -> StoredConnection | None:
    data = _load_or_seed()
    for record in data["connections"]:
        if record.get("id") == id:
            if label is not None:
                record["label"] = label
            if url is not None:
                record["url"] = encrypt(url).decode()
            _save(data)
            conns = _parse_connections(data)
            return next((c for c in conns if c.id == id), None)
    return None


def delete_connection(id: str) -> bool:
    data = _load_or_seed()
    records = data["connections"]
    target = next((r for r in records if r.get("id") == id), None)
    if target is None:
        return False
    if bool(target.get("is_default", False)):
        return False
    if data.get("active_id") == id:
        return False
    data["connections"] = [r for r in records if r.get("id") != id]
    _save(data)
    return True


def get_active_id() -> str | None:
    raw = _read_file()
    if raw is None:
        return None
    active = raw.get("active_id")
    return str(active) if active else None


def set_active(id: str) -> bool:
    data = _load_or_seed()
    if not any(r.get("id") == id for r in data["connections"]):
        return False
    data["active_id"] = id
    _save(data)
    return True
