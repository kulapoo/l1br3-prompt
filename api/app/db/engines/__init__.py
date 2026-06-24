"""Pluggable database engine abstraction (Milestone 1).

Re-exports the Protocols and the registry accessor. Concrete impls live in
sibling modules (``sqlite``; ``postgres`` arrives in M2).
"""

from app.db.engines.base import ConnectionTest, DatabaseEngine, SearchBackend
from app.db.engines.registry import get_active_engine, set_active_engine

__all__ = [
    "ConnectionTest",
    "DatabaseEngine",
    "SearchBackend",
    "get_active_engine",
    "set_active_engine",
]
