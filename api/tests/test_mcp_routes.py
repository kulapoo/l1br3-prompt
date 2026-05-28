"""
HTTP tests for POST /api/v1/mcp/call.

Uses a dedicated in-memory DB so MCP tool functions and the FastAPI test client
share the same data without interfering with other test modules.
"""
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # ensure all ORM models are registered with Base  # noqa: F401
from app.db.base import Base
from app.db.engine import get_db
from app.main import app as _app

_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture()
def mcp_client(monkeypatch):
    Base.metadata.create_all(bind=_engine)
    with _engine.connect() as conn:
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

    monkeypatch.setattr("app.mcp_server.SessionLocal", _Session)

    def _override_get_db():
        with _Session() as s:
            yield s

    _app.dependency_overrides[get_db] = _override_get_db
    with TestClient(_app, raise_server_exceptions=True) as c:
        yield c
    _app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=_engine)


def _seed(title="Test", content="Hello {{name}}", category="General") -> str:
    from app.schemas.prompt import PromptCreate
    from app.services.prompt_service import PromptService

    with _Session() as db:
        svc = PromptService(db)
        return svc.create_prompt(PromptCreate(title=title, content=content, category=category)).id


# ── list_prompts ───────────────────────────────────────────────────────────────


def test_list_prompts_over_http(mcp_client):
    _seed("Alpha")
    _seed("Beta")

    r = mcp_client.post("/api/v1/mcp/call", json={"tool": "list_prompts"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    result = json.loads(body["data"]["result"])
    titles = [p["title"] for p in result]
    assert "Alpha" in titles
    assert "Beta" in titles


def test_list_prompts_empty(mcp_client):
    r = mcp_client.post("/api/v1/mcp/call", json={"tool": "list_prompts"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert json.loads(body["data"]["result"]) == []


# ── get_prompt ────────────────────────────────────────────────────────────────


def test_get_prompt_over_http(mcp_client):
    prompt_id = _seed("My Prompt", "Some content")

    r = mcp_client.post("/api/v1/mcp/call", json={"tool": "get_prompt", "args": {"id": prompt_id}})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    result = json.loads(body["data"]["result"])
    assert result["id"] == prompt_id
    assert result["title"] == "My Prompt"


def test_get_prompt_not_found_returns_fail(mcp_client):
    r = mcp_client.post("/api/v1/mcp/call", json={"tool": "get_prompt", "args": {"id": "no-such-id"}})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert "not found" in body["error"]


# ── render_prompt ─────────────────────────────────────────────────────────────


def test_render_prompt_with_args(mcp_client):
    prompt_id = _seed(content="Hello {{name}}!")

    r = mcp_client.post(
        "/api/v1/mcp/call",
        json={"tool": "render_prompt", "args": {"id": prompt_id, "variables": {"name": "World"}}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["result"] == "Hello World!"


# ── unknown / blocked tools ───────────────────────────────────────────────────


def test_unknown_tool_returns_fail(mcp_client):
    r = mcp_client.post("/api/v1/mcp/call", json={"tool": "nonexistent_tool"})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert "nonexistent_tool" in body["error"]


def test_write_tool_blocked_without_flag(mcp_client, monkeypatch):
    monkeypatch.delenv("L1BR3_MCP_ALLOW_WRITE", raising=False)

    r = mcp_client.post(
        "/api/v1/mcp/call",
        json={"tool": "create_prompt", "args": {"title": "Hack", "content": "bad"}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert "create_prompt" in body["error"]
