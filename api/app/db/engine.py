"""Backward-compat shim.

Preserves every existing ``from app.db.engine import ...`` site by re-exporting
the legacy module-level names (``engine``, ``SessionLocal``, ``DATABASE_URL``,
``get_db``) from the active engine resolved via ``app.db.engines.registry``.

New code should import from ``app.db.engines`` directly.
"""

from typing import Generator

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.engines.registry import get_active_engine, set_active_engine

_active = get_active_engine()

DATABASE_URL: str = _active.url
engine: Engine = _active.engine
SessionLocal: sessionmaker = _active.SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = [
    "DATABASE_URL",
    "engine",
    "SessionLocal",
    "get_db",
    "get_active_engine",
    "set_active_engine",
]
