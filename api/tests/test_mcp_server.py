"""
Tests for the MCP server tool functions.

We test the underlying Python functions directly — no need to spin up stdio.
The write-guard is tested by checking the PermissionError raised without the env var.
"""
import json
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# L1BR3_TESTING is already set by conftest.py (imported before this module)
from app.db.base import Base
from app.db.engine import SessionLocal as _OriginalSessionLocal


# ── In-memory DB fixture for MCP tests ────────────────────────────────────────

_mcp_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_MCPSession = sessionmaker(autocommit=False, autoflush=False, bind=_mcp_engine)


@pytest.fixture(autouse=True)
def setup_mcp_db(monkeypatch):
    """Patch SessionLocal used by mcp_server to use the in-memory test DB."""
    import app.models  # ensure models are registered  # noqa: F401

    Base.metadata.create_all(bind=_mcp_engine)
    with _mcp_engine.connect() as conn:
        conn.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
                title, content, content='prompts', content_rowid='rowid'
            )
        """))
        conn.execute(text("""
            CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
                INSERT INTO prompts_fts(rowid, title, content)
                VALUES (new.rowid, new.title, new.content);
            END
        """))
        conn.commit()

    monkeypatch.setattr("app.mcp_server.SessionLocal", _MCPSession)
    yield
    Base.metadata.drop_all(bind=_mcp_engine)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _seed_prompt(title="Test Prompt", content="Hello {{name}}", category="General"):
    from app.schemas.prompt import PromptCreate
    from app.services.prompt_service import PromptService

    with _MCPSession() as db:
        svc = PromptService(db)
        prompt = svc.create_prompt(PromptCreate(title=title, content=content, category=category))
        return prompt.id


# ── list_prompts ───────────────────────────────────────────────────────────────


def test_list_prompts_returns_all():
    _seed_prompt("Alpha")
    _seed_prompt("Beta")

    from app.mcp_server import list_prompts
    result = json.loads(list_prompts())
    titles = [p["title"] for p in result]
    assert "Alpha" in titles
    assert "Beta" in titles


def test_list_prompts_empty():
    from app.mcp_server import list_prompts
    result = json.loads(list_prompts())
    assert result == []


# ── get_prompt ────────────────────────────────────────────────────────────────


def test_get_prompt_found():
    prompt_id = _seed_prompt("My Prompt", "Content here")

    from app.mcp_server import get_prompt
    result = json.loads(get_prompt(prompt_id))
    assert result["id"] == prompt_id
    assert result["title"] == "My Prompt"
    assert result["content"] == "Content here"


def test_get_prompt_not_found():
    from app.mcp_server import get_prompt
    with pytest.raises(ValueError, match="not found"):
        get_prompt("nonexistent-id")


# ── render_prompt ─────────────────────────────────────────────────────────────


def test_render_prompt_substitutes_variables():
    prompt_id = _seed_prompt(content="Hello {{name}}!")

    from app.mcp_server import render_prompt
    result = render_prompt(prompt_id, {"name": "World"})
    assert result == "Hello World!"


def test_render_prompt_not_found():
    from app.mcp_server import render_prompt
    with pytest.raises(ValueError):
        render_prompt("bad-id", {})


# ── write guard ────────────────────────────────────────────────────────────────


def test_create_prompt_blocked_without_flag(monkeypatch):
    monkeypatch.setattr("app.mcp_server._ALLOW_WRITE", False)

    from app.mcp_server import create_prompt
    with pytest.raises(PermissionError):
        create_prompt("New", "Content")


def test_delete_prompt_blocked_without_flag(monkeypatch):
    monkeypatch.setattr("app.mcp_server._ALLOW_WRITE", False)

    from app.mcp_server import delete_prompt
    with pytest.raises(PermissionError):
        delete_prompt("some-id")


def test_create_prompt_allowed_with_flag(monkeypatch):
    monkeypatch.setattr("app.mcp_server._ALLOW_WRITE", True)

    from app.mcp_server import create_prompt, list_prompts
    result = json.loads(create_prompt("Flag Test", "content"))
    assert "id" in result
    assert result["title"] == "Flag Test"

    all_prompts = json.loads(list_prompts())
    assert any(p["title"] == "Flag Test" for p in all_prompts)


def test_delete_prompt_allowed_with_flag(monkeypatch):
    monkeypatch.setattr("app.mcp_server._ALLOW_WRITE", True)
    prompt_id = _seed_prompt("To Delete")

    from app.mcp_server import delete_prompt, list_prompts
    result = json.loads(delete_prompt(prompt_id))
    assert result["deleted"] == prompt_id

    remaining = json.loads(list_prompts())
    assert not any(p["id"] == prompt_id for p in remaining)
