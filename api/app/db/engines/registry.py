"""Registry for the active database engine.

Mirrors ``app.services.ai.factory``: a single resolver returning the active impl,
cached as a module-level singleton and overridable for tests via
``set_active_engine``.

Resolution precedence (M3 added the persisted-store tier):
  1. Persisted store active connection (``~/.l1br3/databases.json``) — the
     UI "set-active" selection; authoritative so it is never silently overridden
     by a stale env var. Only consulted when the file actually exists so the
     zero-config path and the test suite stay hermetic.
  2. ``L1BR3_DATABASE_URL`` — explicit env override (CI / power user).
  3. ``L1BR3_DB_PATH`` / default — legacy SQLite-only knob, preserved bit-for-bit.

Dialect dispatch lives in ``build_engine_for_url``: ``postgresql*`` URLs resolve to
``PostgresEngine`` (M2), everything else to ``SqliteEngine``. It is public so the
M4 migration wizard can construct a target engine without disturbing the active
singleton.
"""

import logging
import os

from app.db import connection_store
from app.db.engines.base import DatabaseEngine
from app.db.engines.postgres import PostgresEngine
from app.db.engines.sqlite import SqliteEngine

logger = logging.getLogger(__name__)

_active_engine: DatabaseEngine | None = None


def get_active_engine() -> DatabaseEngine:
    """Return the cached active engine, building it on first access."""
    global _active_engine
    if _active_engine is None:
        _active_engine = _resolve_engine()
    return _active_engine


def _resolve_engine() -> DatabaseEngine:
    """Build the active engine from the current env + store state."""
    # 1. UI-selected active connection — authoritative so "set-active" is never
    #    silently overridden by a stale env var.
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

    # 2. Explicit env override (CI / power user), only when no UI selection exists.
    database_url = os.environ.get("L1BR3_DATABASE_URL")
    if database_url:
        return build_engine_for_url(database_url)

    # 3. Legacy SQLite path / zero-config default.
    return SqliteEngine.from_env()


def build_engine_for_url(url: str) -> DatabaseEngine:
    """Construct the concrete engine for a URL, branching on dialect.

    Public so callers (notably the M4 migration wizard) can build a non-active
    engine — e.g. a migration target — without swapping the active singleton.
    """
    if url.startswith("postgresql"):
        return PostgresEngine(url)
    return SqliteEngine(url)


def set_active_engine(engine: DatabaseEngine | None) -> None:
    """Override (or clear with ``None``) the active engine singleton."""
    global _active_engine
    _active_engine = engine


def reload_active_engine() -> None:
    """Invalidate the cached singleton and rebuild from current env + store.

    Called after a UI "set-active" so subsequent requests use the new DB without
    an API restart.
    """
    global _active_engine
    _active_engine = None
    get_active_engine()
