"""Streaming data-migration service (Milestone 4).

``iter_migration`` copies every row of every user-data table from a source
``DatabaseEngine`` to a target ``DatabaseEngine`` inside ONE target transaction.
On any exception — including ``GeneratorExit`` from ``gen.close()`` on a client
disconnect — the transaction rolls back, leaving the target empty-but-migrated
(inert) and the source untouched. The active connection is swapped by the caller
ONLY after the generator runs to completion (``StopIteration`` ⇒ commit).

The copy is Core-level (``select(table)`` → ``insert(table)``) so the same code
path works for any dialect pair (sqlite ↔ postgresql) with no dialect branches.
The search index is NOT copied explicitly: SQLite FTS5 triggers and the Postgres
``search_tsv`` generated column are DB-maintained from prompt rows, so they
populate automatically as rows are inserted.

Security: this module never logs or emits the source/target URLs. The route
layer wraps every error in ``_safe_error`` (redact URL + password) before it
reaches a response frame.
"""

import logging
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import cast

from sqlalchemy import Connection, Table, func, insert, select

from app.db.engines.base import DatabaseEngine
from app.models.ai_provider import AIProviderModel
from app.models.prompt import Prompt, prompt_tags
from app.models.tag import Tag
from app.models.transform_mode import TransformMode

logger = logging.getLogger(__name__)

# Per-batch insert size; balances progress feedback frequency vs. overhead.
_BATCH_SIZE = 500

# FK-safe copy order: the prompt_tags junction comes after both endpoints.
# Model ``__table__`` attributes are ``FromClause`` in SQLAlchemy's stubs but
# ``Table`` at runtime; the cast preserves the ``.name``/``insert()`` API.
_COPY_ORDER: list[Table] = [
    cast(Table, Tag.__table__),
    cast(Table, Prompt.__table__),
    prompt_tags,
    cast(Table, TransformMode.__table__),
    cast(Table, AIProviderModel.__table__),
]


@dataclass(frozen=True)
class MigrationMeta:
    """First event: announces the dialect pair + ordered copy plan."""

    source_engine: str
    target_engine: str
    tables: list[str]


@dataclass(frozen=True)
class TableProgress:
    """Per-table progress. ``phase`` is ``"copying"`` mid-batch or ``"done"`` at completion."""

    table: str
    phase: str
    copied: int
    total: int


MigrationEvent = MigrationMeta | TableProgress


class MigrationError(Exception):
    """Raised when a migration precondition fails (e.g. target not empty).

    Carries no secret material; the route layer redacts regardless.
    """


def _assert_empty(target_conn: Connection) -> None:
    """Refuse to copy into a target that already has user data."""
    for table in _COPY_ORDER:
        count = target_conn.execute(select(func.count()).select_from(table)).scalar_one()
        if count:
            raise MigrationError(f"Target is not empty: table {table.name!r} already has {count} row(s).")


def _chunked(rows: Iterable, size: int) -> Iterator[list]:
    """Yield successive lists of ``size`` from ``rows`` (last batch may be smaller)."""
    batch: list = []
    for row in rows:
        batch.append(row)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def iter_migration(source: DatabaseEngine, target: DatabaseEngine) -> Iterator[MigrationEvent]:
    """Yield progress events while copying all user data from source → target.

    The entire copy runs inside one target transaction (``target.engine.begin()``).
    Any exception — including ``GeneratorExit`` from ``gen.close()`` on client
    disconnect — rolls the target back to its pre-copy state. The caller swaps
    the active connection ONLY after this generator is exhausted cleanly.
    """
    yield MigrationMeta(
        source_engine=source.dialect,
        target_engine=target.dialect,
        tables=[t.name for t in _COPY_ORDER],
    )
    logger.info("Migration started: %s -> %s", source.dialect, target.dialect)

    with target.engine.begin() as target_conn, source.engine.connect() as source_conn:
        _assert_empty(target_conn)
        for table in _COPY_ORDER:
            total = source_conn.execute(select(func.count()).select_from(table)).scalar_one()
            yield TableProgress(table=table.name, phase="copying", copied=0, total=total)

            copied = 0
            cursor = source_conn.execution_options(stream_results=True).execute(select(table))
            for batch in _chunked(cursor.mappings(), _BATCH_SIZE):
                target_conn.execute(insert(table), [dict(row) for row in batch])
                copied += len(batch)
                yield TableProgress(table=table.name, phase="copying", copied=copied, total=total)

            yield TableProgress(table=table.name, phase="done", copied=copied, total=total)
            logger.info("Migration: copied %d row(s) into '%s'", copied, table.name)

    logger.info("Migration complete: target transaction committed")
