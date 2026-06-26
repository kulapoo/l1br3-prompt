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

Credentials live in plaintext here for the M3 functional MVP; M5 retrofits
``app.services.security.crypto`` encryption onto the credential-bearing URL.
"""

import json
import logging
import os
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.db.engines.sqlite import DEFAULT_DB_PATH

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
    return raw if raw is not None else _seed_data()


# ── record <-> dataclass ─────────────────────────────────────────────────────


def _to_record(conn: StoredConnection) -> dict[str, Any]:
    return {
        "id": conn.id,
        "label": conn.label,
        "engine": conn.engine,
        "url": conn.url,
        "created_at": conn.created_at.isoformat(),
        "is_default": conn.is_default,
    }


def _parse_connections(raw: dict[str, Any]) -> list[StoredConnection]:
    conns: list[StoredConnection] = []
    for item in raw.get("connections", []):
        if not isinstance(item, dict):
            continue
        try:
            conns.append(
                StoredConnection(
                    id=str(item["id"]),
                    label=str(item["label"]),
                    engine=str(item["engine"]),
                    url=str(item["url"]),
                    created_at=datetime.fromisoformat(str(item["created_at"])),
                    is_default=bool(item.get("is_default", False)),
                )
            )
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning("Skipping malformed connection record: %s", exc)
    return conns


# ── public API ───────────────────────────────────────────────────────────────


def list_connections() -> list[StoredConnection]:
    raw = _read_file()
    if raw is None:
        return [_default_connection()]
    return _parse_connections(raw)


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
                record["url"] = url
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
