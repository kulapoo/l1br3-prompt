import json

import httpx
import pytest
from pytest_httpx import HTTPXMock


# ── /process-template ──────────────────────────────────────────────────────────


def test_process_template_simple(client):
    r = client.post(
        "/api/v1/process-template",
        json={"template": "Hello {{name}}!", "variables": {"name": "World"}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    assert body["data"]["rendered"] == "Hello World!"
    assert "name" in body["data"]["variables"]


def test_process_template_finds_variables(client):
    r = client.post(
        "/api/v1/process-template",
        json={"template": "{{a}} and {{b}}", "variables": {"a": "x", "b": "y"}},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert sorted(data["variables"]) == ["a", "b"]


def test_process_template_bad_template_returns_fail(client):
    r = client.post(
        "/api/v1/process-template",
        json={"template": "{% if %}", "variables": {}},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is False
    assert body["error"]


def test_process_template_undefined_variable_returns_fail(client):
    r = client.post(
        "/api/v1/process-template",
        json={"template": "{{missing}}", "variables": {}},
    )
    assert r.status_code == 200
    assert r.json()["success"] is False


# ── /generate ──────────────────────────────────────────────────────────────────


def test_generate_503_when_ollama_unreachable(client, httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url="http://127.0.0.1:11434/api/tags")
    r = client.post("/api/v1/generate", json={"prompt": "Hello"})
    assert r.status_code == 503


def test_generate_streams_sse_frames(client, httpx_mock: HTTPXMock):
    # Mock health check
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/tags",
        json={"models": [{"name": "llama3:8b"}]},
    )
    # Mock streaming response
    ndjson = "\n".join([
        json.dumps({"response": "Hi", "done": False}),
        json.dumps({"response": " there", "done": False}),
        json.dumps({"response": "", "done": True}),
    ])
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/generate",
        text=ndjson,
    )

    r = client.post("/api/v1/generate", json={"prompt": "Say hi", "model": "llama3:8b"})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]

    # Parse SSE frames from response body
    chunks = []
    done = False
    for line in r.text.splitlines():
        if line.startswith("data: "):
            payload = json.loads(line[6:])
            if payload.get("done"):
                done = True
            elif "chunk" in payload:
                chunks.append(payload["chunk"])

    assert chunks == ["Hi", " there"]
    assert done is True
