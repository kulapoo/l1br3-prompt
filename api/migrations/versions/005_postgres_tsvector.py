"""postgres tsvector search index

Revision ID: 005
Revises: 004
Create Date: 2026-06-26

This revision is the **Postgres search carrier**. It is the first dialect-guarded
migration in the chain: the tsvector generated column + GIN index only apply on
PostgreSQL. On SQLite (the zero-config default) it is an inert no-op, so the FTS5
path from 001_initial is untouched.

Guard rationale: prior revisions (001-004) were written SQLite-first and contain
SQLite-isms (FTS5 virtual table, INTEGER booleans). Those are deliberately NOT
forked here — 005 exists solely to add the Postgres search index. If a later
audit finds a prior revision that breaks on Postgres, it gets its own guard at
that revision; we do not retro-fork the chain.

The DDL is imported from ``app.db.engines.postgres`` so there is exactly one
source of truth for the search-index shape (the engine's ``search.init`` and this
migration must never drift). Those strings are free of model imports, so no
import cycle.
"""

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

from alembic import op

from app.db.engines.postgres import (  # noqa: E402 — revision header must stay first
    _DROP_COLUMN_DDL,
    _DROP_INDEX_DDL,
    _TSV_COLUMN_DDL,
    _TSV_GIN_DDL,
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # No-op on SQLite/other dialects: FTS5 (001_initial) is the search path there.
        return
    op.execute(_TSV_COLUMN_DDL)
    op.execute(_TSV_GIN_DDL)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.execute(_DROP_INDEX_DDL)
    op.execute(_DROP_COLUMN_DDL)
