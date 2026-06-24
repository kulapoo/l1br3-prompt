"""Integration tests for /generate routing through BYOK providers.

Covers the full meta/chunk/done SSE frame contract end-to-end, the meta-frame provider
label, and verifies the API key never appears in any response payload or error frame.
"""

import json

import httpx
from pytest_httpx import HTTPXMock

OPENAI_MODELS_URL = "https://api.openai.com/v1/models"
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models"
ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"

SECRET_OPENAI_KEY = "sk-secret-openai-key-12345"
SECRET_ANT_KEY = "sk-ant-secret-67890"


def _openai_sse(chunks: list[str]) -> str:
    body = ""
    for c in chunks:
        body += f"data: {json.dumps({'choices': [{'delta': {'content': c}}]})}\n\n"
    body += "data: [DONE]\n\n"
    return body


def _anthropic_sse(chunks: list[str]) -> str:
    body = ""
    for c in chunks:
        body += "event: content_block_delta\n"
        body += f"data: {json.dumps({'delta': {'type': 'text_delta', 'text': c}})}\n\n"
    body += 'event: message_stop\ndata: {"type": "message_stop"}\n\n'
    return body


def _frames(text: str) -> list[dict]:
    return [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]


def test_generate_byok_openai_streams_full_frame_sequence(client, httpx_mock: HTTPXMock):
    """OpenAI BYOK: meta(byok:openai) → chunk* → done, full sequence."""
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, text=_openai_sse(["Hel", "lo"]))

    r = client.post(
        "/api/v1/generate",
        json={
            "prompt": "hi",
            "byok": {"type": "openai", "apiKey": SECRET_OPENAI_KEY},
        },
    )
    assert r.status_code == 200
    frames = _frames(r.text)
    assert frames[0] == {"meta": {"provider": "byok:openai"}}
    assert frames[1] == {"chunk": "Hel"}
    assert frames[2] == {"chunk": "lo"}
    assert frames[-1] == {"done": True}


def test_generate_byok_anthropic_streams_full_frame_sequence(client, httpx_mock: HTTPXMock):
    """Anthropic BYOK: meta(byok:anthropic) → chunk* → done."""
    httpx_mock.add_response(
        url=ANTHROPIC_MODELS_URL,
        json={"data": [{"id": "claude-3-5-sonnet-20241022"}]},
    )
    httpx_mock.add_response(url=ANTHROPIC_MESSAGES_URL, text=_anthropic_sse(["world"]))

    r = client.post(
        "/api/v1/generate",
        json={
            "prompt": "hi",
            "model": "claude-3-5-sonnet-20241022",
            "byok": {"type": "anthropic", "apiKey": SECRET_ANT_KEY},
        },
    )
    assert r.status_code == 200
    frames = _frames(r.text)
    assert frames[0] == {"meta": {"provider": "byok:anthropic"}}
    assert {"chunk": "world"} in frames
    assert frames[-1] == {"done": True}


def test_generate_byok_openai_compatible_uses_custom_base_url(client, httpx_mock: HTTPXMock):
    custom_models = "http://localhost:1234/v1/models"
    custom_chat = "http://localhost:1234/v1/chat/completions"
    httpx_mock.add_response(url=custom_models, json={"data": [{"id": "local"}]})
    httpx_mock.add_response(url=custom_chat, text=_openai_sse(["x"]))

    r = client.post(
        "/api/v1/generate",
        json={
            "prompt": "hi",
            "byok": {
                "type": "openai_compatible",
                "apiKey": "any",
                "baseUrl": "http://localhost:1234/v1",
            },
        },
    )
    assert r.status_code == 200
    frames = _frames(r.text)
    assert frames[0] == {"meta": {"provider": "byok:openai_compatible"}}


def test_generate_byok_unreachable_returns_503_not_silent_fallback(client, httpx_mock: HTTPXMock):
    """Explicit BYOK that fails health check must 503 — never silently downgrade to Ollama/Cloud."""
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OPENAI_MODELS_URL)

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"type": "openai", "apiKey": SECRET_OPENAI_KEY}},
    )
    assert r.status_code == 503
    assert "BYOK provider unreachable" in r.json().get("detail", "")


def test_generate_byok_stream_error_surfaces_error_frame(client, httpx_mock: HTTPXMock):
    """Mid-stream provider error produces an error SSE frame and key never leaks."""
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, status_code=401, json={"error": "bad key"})

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"type": "openai", "apiKey": SECRET_OPENAI_KEY}},
    )
    # 401 surfaces as an SSE error frame (stream started after health passed)
    assert r.status_code == 200
    frames = _frames(r.text)
    error_frames = [f for f in frames if "error" in f]
    assert len(error_frames) == 1
    assert "auth_error" in error_frames[0]["error"]


def test_generate_byok_api_key_never_appears_in_response_payload(client, httpx_mock: HTTPXMock):
    """Critical: the API key must never appear in any response body (success or error)."""
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, status_code=401, json={"error": "bad key"})

    r = client.post(
        "/api/v1/generate",
        json={"prompt": "hi", "byok": {"type": "openai", "apiKey": SECRET_OPENAI_KEY}},
    )
    assert SECRET_OPENAI_KEY not in r.text


def test_generate_byok_anthropic_key_never_appears_in_response_payload(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=ANTHROPIC_MODELS_URL,
        json={"data": [{"id": "claude-3-5-sonnet-20241022"}]},
    )
    httpx_mock.add_response(
        url=ANTHROPIC_MESSAGES_URL,
        text=_anthropic_sse(["safe response"]),
    )

    r = client.post(
        "/api/v1/generate",
        json={
            "prompt": "hi",
            "model": "claude-3-5-sonnet-20241022",
            "byok": {"type": "anthropic", "apiKey": SECRET_ANT_KEY},
        },
    )
    assert r.status_code == 200
    assert SECRET_ANT_KEY not in r.text


def test_transform_byok_openai_streams_through_route(client, httpx_mock: HTTPXMock):
    """Transform route also honors the byok field end-to-end."""
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    httpx_mock.add_response(url=OPENAI_CHAT_URL, text=_openai_sse(["rewritten"]))

    r = client.post(
        "/api/v1/transform",
        json={
            "prompt": "make this concise",
            "byok": {"type": "openai", "apiKey": SECRET_OPENAI_KEY},
        },
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
    # Ollama generate stream
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
