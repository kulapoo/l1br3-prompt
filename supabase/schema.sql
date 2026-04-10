-- l1br3-prompt Supabase schema
-- Run this once in the Supabase SQL editor for your project.
-- See docs/supabase-setup.md for full setup instructions.

-- Prompts table — mirrors local SQLite schema with user_id for RLS
CREATE TABLE IF NOT EXISTS prompts (
    id           UUID PRIMARY KEY,               -- same UUID as local SQLite id
    user_id      UUID REFERENCES auth.users NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT 'General',
    usage_count  INTEGER NOT NULL DEFAULT 0,
    last_used    TIMESTAMPTZ,
    is_favorite  BOOLEAN NOT NULL DEFAULT FALSE,
    tags         TEXT[] NOT NULL DEFAULT '{}',   -- denormalized tag names for simplicity
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    deleted_at   TIMESTAMPTZ                     -- soft-delete tombstone for sync
);

-- Index for efficient per-user queries
CREATE INDEX IF NOT EXISTS prompts_user_id_idx ON prompts (user_id);
CREATE INDEX IF NOT EXISTS prompts_updated_at_idx ON prompts (user_id, updated_at DESC);

-- Row Level Security: users can only access their own prompts
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their prompts"
    ON prompts
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Enable Realtime for live sync (optional, used by the Supabase JS client)
ALTER PUBLICATION supabase_realtime ADD TABLE prompts;
