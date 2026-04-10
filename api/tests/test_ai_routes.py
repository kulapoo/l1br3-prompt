import httpx
import pytest
from pytest_httpx import HTTPXMock


def test_ai_status_reachable(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/tags",
        json={"models": [{"name": "llama3:8b"}, {"name": "mistral:latest"}]},
    )
    r = client.get("/api/v1/ai/status")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    data = body["data"]
    assert data["ollama"]["reachable"] is True
    assert "llama3:8b" in data["ollama"]["models"]
    assert data["provider"] == "ollama"


def test_ai_status_unreachable(client, httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url="http://127.0.0.1:11434/api/tags")
    r = client.get("/api/v1/ai/status")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    data = body["data"]
    assert data["ollama"]["reachable"] is False
    assert data["ollama"]["models"] == []
    assert data["provider"] is None
