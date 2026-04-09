"""Initial schema with FTS5

Revision ID: 001
Revises:
Create Date: 2026-04-09
"""

revision = "001"
down_revision = None
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("""
        CREATE TABLE tags (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            color TEXT NOT NULL DEFAULT '#6B7280',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE prompts (
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
        CREATE TABLE prompt_tags (
            prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (prompt_id, tag_id)
        )
    """)

    # FTS5 virtual table for full-text search on title + content
    op.execute("""
        CREATE VIRTUAL TABLE prompts_fts USING fts5(
            title,
            content,
            content='prompts',
            content_rowid='rowid'
        )
    """)

    # Triggers to keep FTS index in sync
    op.execute("""
        CREATE TRIGGER prompts_ai AFTER INSERT ON prompts BEGIN
            INSERT INTO prompts_fts(rowid, title, content)
            VALUES (new.rowid, new.title, new.content);
        END
    """)

    op.execute("""
        CREATE TRIGGER prompts_ad AFTER DELETE ON prompts BEGIN
            INSERT INTO prompts_fts(prompts_fts, rowid, title, content)
            VALUES ('delete', old.rowid, old.title, old.content);
        END
    """)

    op.execute("""
        CREATE TRIGGER prompts_au AFTER UPDATE ON prompts BEGIN
            INSERT INTO prompts_fts(prompts_fts, rowid, title, content)
            VALUES ('delete', old.rowid, old.title, old.content);
            INSERT INTO prompts_fts(rowid, title, content)
            VALUES (new.rowid, new.title, new.content);
        END
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS prompts_au")
    op.execute("DROP TRIGGER IF EXISTS prompts_ad")
    op.execute("DROP TRIGGER IF EXISTS prompts_ai")
    op.execute("DROP TABLE IF EXISTS prompts_fts")
    op.execute("DROP TABLE IF EXISTS prompt_tags")
    op.execute("DROP TABLE IF EXISTS prompts")
    op.execute("DROP TABLE IF EXISTS tags")
