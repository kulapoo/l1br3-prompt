"""Integration tests for /generate routing through cloud fallback."""
import json

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ai.cloud import DEFAULT_WORKER_URL

DEVICE_ID = "gen-cloud-device"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
WORKER_HEALTH_URL = f"{DEFAULT_WORKER_URL}/v1/health?device={DEVICE_ID}"
WORKER_GENERATE_URL = f"{DEFAULT_WORKER_URL}/v1/generate"


def _sse(frames: list[dict]) -> str:
    return "".join(f"data: {json.dumps(f)}\n\n" for f in frames)


def test_generate_uses_cloud_when_ollama_down(client, httpx_mock: HTTPXMock):
    """When Ollama is unreachable and cloudEnabled=true, /generate routes to the worker."""
    # Ollama unreachable (both health + generate check)
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)
    # Cloud health reachable (single call — factory reuses the status for model resolution)
    httpx_mock.add_response(
        url=WORKER_HEALTH_URL,
        json={
            "providers": ["groq", "gemini"],
            "quota": {"used": 0, "remaining": 50, "total": 50, "resetAt": "2026-04-11T00:00:00Z"},
        },
    )
    # Cloud stream response
    sse_body = _sse([
        {"meta": {"provider": "groq"}},
        {"chunk": "cloud"},
        {"chunk": " response"},
        {"done": True},
    ])
    httpx_mock.add_response(url=WORKER_GENERATE_URL, text=sse_body)

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hello", "cloudEnabled": True},
        headers={"X-Device-Id": DEVICE_ID},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    text = r.text
    assert "cloud" in text
    assert "response" in text
    assert '"done": true' in text
    # Should include the meta frame with the provider label.
    assert '"provider"' in text


def test_generate_returns_503_when_both_providers_down(client, httpx_mock: HTTPXMock):
    """503 when Ollama is down and cloud is disabled (or also down)."""
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hello", "cloudEnabled": False},
    )
    assert r.status_code == 503
    detail = r.json().get("detail", "")
    assert "No AI provider" in detail or "Ollama" in detail


def test_generate_sse_frame_shape_is_identical_for_cloud_and_ollama(client, httpx_mock: HTTPXMock):
    """Cloud SSE frames must be identical in shape to Ollama frames."""
    # Ollama unreachable
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)
    # Worker health (single call — factory reuses the status)
    httpx_mock.add_response(
        url=WORKER_HEALTH_URL,
        json={"providers": ["groq", "gemini"], "quota": {"used": 0, "remaining": 50, "total": 50, "resetAt": ""}},
    )
    # Worker stream
    httpx_mock.add_response(
        url=WORKER_GENERATE_URL,
        text=_sse([{"meta": {"provider": "groq"}}, {"chunk": "hi"}, {"done": True}]),
    )

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "test", "cloudEnabled": True},
        headers={"X-Device-Id": DEVICE_ID},
    )
    assert r.status_code == 200
    frames = [
        json.loads(line[6:])
        for line in r.text.splitlines()
        if line.startswith("data: ")
    ]
    chunk_frames = [f for f in frames if "chunk" in f]
    done_frames = [f for f in frames if f.get("done") is True]
    assert chunk_frames == [{"chunk": "hi"}]
    assert len(done_frames) == 1
