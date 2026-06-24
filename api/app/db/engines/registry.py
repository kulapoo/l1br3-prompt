"""Registry for the active database engine.

Mirrors ``app.services.ai.factory``: a single resolver returning the active impl,
cached as a module-level singleton and overridable for tests via
``set_active_engine``. M1 selects SQLite only; M2+ will branch on URL dialect.
"""

from app.db.engines.base import DatabaseEngine
from app.db.engines.sqlite import SqliteEngine

_active_engine: DatabaseEngine | None = None


def get_active_engine() -> DatabaseEngine:
    """Return the cached active engine, building it on first access."""
    global _active_engine
    if _active_engine is None:
        _active_engine = SqliteEngine.from_env()
    return _active_engine


def set_active_engine(engine: DatabaseEngine | None) -> None:
    """Override (or clear with ``None``) the active engine singleton."""
    global _active_engine
    _active_engine = engine
