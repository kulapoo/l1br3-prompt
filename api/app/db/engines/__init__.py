"""Pluggable database engine abstraction.

Re-exports the Protocols and the registry accessor. Concrete impls live in
sibling modules: ``sqlite`` (default) and ``postgres`` (M2).
"""

from app.db.engines.base import ConnectionTest, DatabaseEngine, SearchBackend
from app.db.engines.postgres import PostgresEngine
from app.db.engines.registry import get_active_engine, reload_active_engine, set_active_engine
from app.db.engines.sqlite import SqliteEngine

__all__ = [
    "ConnectionTest",
    "DatabaseEngine",
    "PostgresEngine",
    "SearchBackend",
    "SqliteEngine",
    "get_active_engine",
    "reload_active_engine",
    "set_active_engine",
]
