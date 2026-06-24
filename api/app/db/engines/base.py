"""Protocol definitions for the pluggable database engine abstraction.

Mirrors the shape of ``app.services.ai.provider``: ``@runtime_checkable``
Protocols that concrete engines/backends duck-type rather than subclass.
Kept free of model imports so it never participates in an import cycle.
"""

from dataclasses import dataclass
from typing import Generator, Protocol, runtime_checkable

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker


@dataclass(frozen=True)
class ConnectionTest:
    """Result of a connection test. Holds no secrets — safe to serialize (used in M3)."""

    ok: bool
    error: str | None = None


@runtime_checkable
class SearchBackend(Protocol):
    """Full-text / semantic search seam. SQLite uses FTS5 now; Postgres/tsvector in M2."""

    def init(self, connection: object) -> None:
        """Create search index tables/triggers on the given connection."""
        ...

    def search_prompts(self, db: Session, query: str) -> list[str]:
        """Return prompt IDs matching ``query``, ordered by relevance."""
        ...

    def drop(self, connection: object) -> None:
        """Remove the search index (used for test teardown)."""
        ...


@runtime_checkable
class DatabaseEngine(Protocol):
    """Pluggable DB engine. The active impl is resolved by ``engines.registry``."""

    url: str
    engine: Engine
    SessionLocal: sessionmaker
    dialect: str
    search: SearchBackend

    def init_schema(self, connection: object) -> None:
        """Idempotent schema bootstrap hook (no-op for engines that rely on Alembic)."""
        ...

    def get_db(self) -> Generator[Session, None, None]:
        """FastAPI dependency yielding a session, then closing it."""
        ...
