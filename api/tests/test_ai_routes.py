import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ai.cloud import DEFAULT_WORKER_URL

DEVICE_ID = "status-test-device"
WORKER_HEALTH_URL = f"{DEFAULT_WORKER_URL}/v1/health?device={DEVICE_ID}"


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


def test_ai_status_cloud_reachable(client, httpx_mock: HTTPXMock):
    """When cloud=true and device-id header is present, cloud status is populated."""
    # Ollama unreachable
    httpx_mock.add_exception(httpx.ConnectError("refused"), url="http://127.0.0.1:11434/api/tags")
    # Cloud worker reachable
    httpx_mock.add_response(
        url=WORKER_HEALTH_URL,
        json={
            "providers": ["groq", "gemini"],
            "quota": {"used": 5, "remaining": 45, "total": 50, "resetAt": "2026-04-11T00:00:00Z"},
        },
    )
    r = client.get(
        "/api/v1/ai/status",
        params={"cloud": "true"},
        headers={"X-Device-Id": DEVICE_ID},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["ollama"]["reachable"] is False
    assert data["cloud"]["reachable"] is True
    assert data["cloud"]["quotaRemaining"] == 45
    assert data["cloud"]["quotaTotal"] == 50
    assert data["provider"] == "cloud"


def test_ai_status_cloud_not_queried_without_device_id(client, httpx_mock: HTTPXMock):
    """cloud=true but no device ID — cloud field should be None."""
    httpx_mock.add_exception(httpx.ConnectError("refused"), url="http://127.0.0.1:11434/api/tags")
    r = client.get("/api/v1/ai/status", params={"cloud": "true"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["cloud"] is None
    assert data["provider"] is None
