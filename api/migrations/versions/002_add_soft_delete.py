"""Add soft-delete support to prompts

Revision ID: 002
Revises: 001
Create Date: 2026-04-10
"""

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("ALTER TABLE prompts ADD COLUMN deleted_at TEXT")


def downgrade() -> None:
    # SQLite does not support DROP COLUMN in older versions; recreate table to remove
    op.execute("""
        CREATE TABLE prompts_backup (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'General',
            usage_count INTEGER NOT NULL DEFAULT 0,
            last_used TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    op.execute("""
        INSERT INTO prompts_backup
        SELECT id, title, content, category, usage_count, last_used,
               is_favorite, created_at, updated_at
        FROM prompts
        WHERE deleted_at IS NULL
    """)
    op.execute("DROP TABLE prompts")
    op.execute("ALTER TABLE prompts_backup RENAME TO prompts")
