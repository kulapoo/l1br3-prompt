"""Add ai_providers table for encrypted BYOK key storage (M3)

Revision ID: 004
Revises: 003
Create Date: 2026-06-25
"""

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    # BLOB on SQLite, BYTEA on Postgres — binary type is dialect-specific. Guarded
    # so the same revision applies on both dialects (one chain, not a fork).
    bind = op.get_bind()
    binary_type = "BYTEA" if bind.dialect.name == "postgresql" else "BLOB"
    op.execute(f"""
        CREATE TABLE ai_providers (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            base_url TEXT,
            encrypted_api_key {binary_type} NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_providers")
