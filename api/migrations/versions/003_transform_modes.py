"""Add transform_modes table for user-saved custom transformations

Revision ID: 003
Revises: 002
Create Date: 2026-06-23
"""

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("""
        CREATE TABLE transform_modes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            instruction TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS transform_modes")
