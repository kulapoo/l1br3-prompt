"""Integration tests for /generate routing through BYOK providers (M3).

M3 wire shape: the browser sends ``byok.providerId`` referencing a stored,
encrypted ai_providers row; the plaintext key never appears in any request
body after creation, and never in any response payload, error frame, or log.

Covers the full meta/chunk/done SSE frame contract end-to-end, the meta-frame
provider label, and verifies the API key never appears in any response payload
or error frame.
"""

import json

import httpx
from pytest_httpx import HTTPXMock

OPENAI_MODELS_URL = "https://api.openai.com/v1/models"
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

SECRET_OPENAI_KEY = "sk-secret-openai-key-12345"


def _seed_provider(client, *, type="openai", base_url=None, api_key=SECRET_OPENAI_KEY) -> str:
    """Create a stored provider via the API and return its id."""
    body = {"type": type, "apiKey": api_key}
    if base_url is not None:
        body["baseUrl"] = base_url
    r = client.post("/api/v1/providers", json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


def _openai_sse(chunks: list[str]) -> str:
    body = ""
    for c in chunks:
        body += f"data: {json.dumps({'choices': [{'delta': {'content': c}}]})}\n\n"
    body += "data: [DONE]\n\n"
    return body


def _frames(text: str) -> list[dict]:
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


def test_generate_byok_openai_streams_full_frame_sequence(client, httpx_mock: HTTPXMock):
    """OpenAI BYOK via provider_id: meta(byok:openai) → chunk* → done."""
    pid = _seed_provider(client, api_key=SECRET_OPENAI_KEY)
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, text=_openai_sse(["Hel", "lo"]))

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"providerId": pid}},
    )
    assert r.status_code == 200
    frames = _frames(r.text)
    assert frames[0] == {"meta": {"provider": "byok:openai"}}
    assert frames[1] == {"chunk": "Hel"}
    assert frames[2] == {"chunk": "lo"}
    assert frames[-1] == {"done": True}


def test_generate_byok_openai_compatible_uses_custom_base_url(client, httpx_mock: HTTPXMock):
    pid = _seed_provider(client, type="openai_compatible", base_url="http://localhost:1234/v1", api_key="any")
    custom_models = "http://localhost:1234/v1/models"
    custom_chat = "http://localhost:1234/v1/chat/completions"
    httpx_mock.add_response(url=custom_models, json={"data": [{"id": "local"}]})
    httpx_mock.add_response(url=custom_chat, text=_openai_sse(["x"]))

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"providerId": pid}},
    )
    assert r.status_code == 200
    frames = _frames(r.text)
    assert frames[0] == {"meta": {"provider": "byok:openai_compatible"}}


def test_generate_byok_unreachable_returns_503_not_silent_fallback(client, httpx_mock: HTTPXMock):
    """Explicit BYOK that fails health check must 503 — never silently downgrade to Ollama/Cloud."""
    pid = _seed_provider(client, api_key=SECRET_OPENAI_KEY)
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OPENAI_MODELS_URL)

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"providerId": pid}},
    )
    assert r.status_code == 503
    assert "BYOK provider unreachable" in r.json().get("detail", "")


def test_generate_byok_stream_error_surfaces_error_frame(client, httpx_mock: HTTPXMock):
    """Mid-stream provider error produces an error SSE frame and key never leaks."""
    pid = _seed_provider(client, api_key=SECRET_OPENAI_KEY)
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, status_code=401, json={"error": "bad key"})

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"providerId": pid}},
    )
    # 401 surfaces as an SSE error frame (stream started after health passed)
    assert r.status_code == 200
    frames = _frames(r.text)
    error_frames = [f for f in frames if "error" in f]
    assert len(error_frames) == 1
    assert "auth_error" in error_frames[0]["error"]


def test_generate_byok_api_key_never_appears_in_response_payload(client, httpx_mock: HTTPXMock):
    """Critical: the API key must never appear in any response body (success or error)."""
    pid = _seed_provider(client, api_key=SECRET_OPENAI_KEY)
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, status_code=401, json={"error": "bad key"})

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"providerId": pid}},
    )
    assert SECRET_OPENAI_KEY not in r.text


def test_transform_byok_openai_streams_through_route(client, httpx_mock: HTTPXMock):
    """Transform route also honors the provider_id field end-to-end."""
    pid = _seed_provider(client, api_key=SECRET_OPENAI_KEY)
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, text=_openai_sse(["rewritten"]))

    r = client.post(
        "/api/v1/transform",
        json={"prompt": "make this concise", "byok": {"providerId": pid}},
    )
    assert r.status_code == 200
    frames = _frames(r.text)
    assert frames[0] == {"meta": {"provider": "byok:openai"}}
    assert {"chunk": "rewritten"} in frames
    assert frames[-1] == {"done": True}
    assert SECRET_OPENAI_KEY not in r.text


def test_generate_without_byok_unchanged_uses_ollama(client, httpx_mock: HTTPXMock):
    """Regression: no byok field → existing Ollama path untouched."""
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/tags",
        json={"models": [{"name": "llama3:8b"}]},
    )
    body = (
        "".join(f"{json.dumps({'response': 'h', 'done': False})}\n" for _ in range(1))
        + f"{json.dumps({'response': '', 'done': True})}\n"
    )
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/generate",
        text=body,
    )

    r = client.post("/api/v1/generate", json={"prompt": "hi"})
    assert r.status_code == 200
    frames = _frames(r.text)
    assert frames[0] == {"meta": {"provider": "ollama"}}


def test_generate_unknown_provider_id_returns_503(client, httpx_mock: HTTPXMock):
    """A provider_id that doesn't resolve surfaces a clear error, not a silent fallback."""
    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"providerId": "no-such-provider"}},
    )
    assert r.status_code == 503
    assert "No provider with id" in r.json().get("detail", "")
