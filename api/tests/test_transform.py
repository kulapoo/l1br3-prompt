"""Tests for /transform endpoint, build_transform_prompt and resolve_instructions."""

import json

import httpx
from pytest_httpx import HTTPXMock

from app.routes.transform import (
    BUILTIN_INSTRUCTIONS,
    build_transform_prompt,
    resolve_instructions,
)

OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate"


# ── unit: build_transform_prompt ────────────────────────────────────────────


def test_build_transform_prompt_single_mode():
    result = build_transform_prompt("Write a summary", [BUILTIN_INSTRUCTIONS["summarize"]])
    assert BUILTIN_INSTRUCTIONS["summarize"] in result
    assert "Write a summary" in result
    assert "PROMPT TO TRANSFORM" in result
    assert "Return ONLY" in result


def test_build_transform_prompt_best_judgement_mode():
    result = build_transform_prompt("Test prompt", [BUILTIN_INSTRUCTIONS["best_judgement"]])
    assert BUILTIN_INSTRUCTIONS["best_judgement"] in result
    assert "Test prompt" in result


def test_build_transform_prompt_combines_multiple_modes():
    result = build_transform_prompt(
        "hello",
        [BUILTIN_INSTRUCTIONS["summarize"], BUILTIN_INSTRUCTIONS["add_role"]],
    )
    assert BUILTIN_INSTRUCTIONS["summarize"] in result
    assert BUILTIN_INSTRUCTIONS["add_role"] in result
    assert "hello" in result


def test_build_transform_prompt_includes_placeholder_removal_directive():
    result = build_transform_prompt("hello", [BUILTIN_INSTRUCTIONS["summarize"]])
    assert "{{variable}}" in result
    assert "placeholders" in result.lower()


def test_build_transform_prompt_preserves_placeholders_in_input():
    result = build_transform_prompt("Hello {{name}}, do {{task}}", [BUILTIN_INSTRUCTIONS["summarize"]])
    assert "{{name}}" in result
    assert "{{task}}" in result


def test_build_transform_prompt_all_builtin_modes():
    for key, text in BUILTIN_INSTRUCTIONS.items():
        result = build_transform_prompt("hello", [text])
        assert text in result, f"mode={key} instruction not found in prompt"


# ── unit: resolve_instructions ──────────────────────────────────────────────


def test_resolve_instructions_builtins():
    resolved = resolve_instructions(["summarize", "concise"], None, {})
    assert resolved == [BUILTIN_INSTRUCTIONS["summarize"], BUILTIN_INSTRUCTIONS["concise"]]


def test_resolve_instructions_custom_pseudo_mode_uses_instruction():
    resolved = resolve_instructions(["custom"], "Make it shorter", {})
    assert resolved == ["Make it shorter"]


def test_resolve_instructions_custom_db_mode():
    custom_map = {"abc-123": "Make it fun"}
    resolved = resolve_instructions(["abc-123"], None, custom_map)
    assert resolved == ["Make it fun"]


def test_resolve_instructions_combines_builtin_and_custom():
    custom_map = {"abc-123": "Make it fun"}
    resolved = resolve_instructions(["summarize", "custom", "abc-123"], "Add emojis", custom_map)
    assert resolved == [
        BUILTIN_INSTRUCTIONS["summarize"],
        "Add emojis",
        "Make it fun",
    ]


def test_resolve_instructions_empty_modes_falls_back_to_best_judgement():
    resolved = resolve_instructions([], None, {})
    assert resolved == [BUILTIN_INSTRUCTIONS["best_judgement"]]


def test_resolve_instructions_unknown_mode_falls_back_to_best_judgement():
    resolved = resolve_instructions(["nonexistent_mode"], None, {})
    assert resolved == [BUILTIN_INSTRUCTIONS["best_judgement"]]


# ── integration: /transform endpoint ────────────────────────────────────────


def test_transform_503_when_ollama_unreachable(client, httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)
    r = client.post("/api/v1/transform", json={"prompt": "Hello"})
    assert r.status_code == 503


def test_transform_streams_sse_frames_for_builtin_mode(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OLLAMA_TAGS_URL,
        json={"models": [{"name": "llama3:8b"}]},
    )
    ndjson = "\n".join(
        [
            json.dumps({"response": "You", "done": False}),
            json.dumps({"response": " are", "done": False}),
            json.dumps({"response": "", "done": True}),
        ]
    )
    httpx_mock.add_response(url=OLLAMA_GENERATE_URL, text=ndjson)

    r = client.post("/api/v1/transform", json={"prompt": "Write docs", "modes": ["add_role"]})
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]

    chunks = []
    done = False
    for line in r.text.splitlines():
        if line.startswith("data: "):
            payload = json.loads(line[6:])
            if payload.get("done"):
                done = True
            elif "chunk" in payload:
                chunks.append(payload["chunk"])

    assert chunks == ["You", " are"]
    assert done is True


def test_transform_custom_mode_with_instruction(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OLLAMA_TAGS_URL,
        json={"models": [{"name": "llama3:8b"}]},
    )
    httpx_mock.add_response(
        url=OLLAMA_GENERATE_URL,
        text="\n".join(
            [
                json.dumps({"response": "ok", "done": False}),
                json.dumps({"response": "", "done": True}),
            ]
        ),
    )

    r = client.post(
        "/api/v1/transform",
        json={"prompt": "Describe the sky", "modes": ["custom"], "instruction": "Add emojis"},
    )
    assert r.status_code == 200
    frames = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith("data: ")]
    chunk_frames = [f for f in frames if "chunk" in f]
    assert chunk_frames == [{"chunk": "ok"}]


def test_transform_combines_multiple_modes(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OLLAMA_TAGS_URL,
        json={"models": [{"name": "llama3:8b"}]},
    )
    captured: dict = {}

    def _handler(request):
        import httpx as _httpx

        body = json.loads(request.content)
        captured["prompt"] = body["prompt"]
        return _httpx.Response(
            status_code=200,
            text="\n".join(
                [
                    json.dumps({"response": "combined", "done": False}),
                    json.dumps({"response": "", "done": True}),
                ]
            ),
        )

    httpx_mock.add_callback(_handler, url=OLLAMA_GENERATE_URL)

    r = client.post(
        "/api/v1/transform",
        json={"prompt": "Improve me", "modes": ["summarize", "add_role"]},
    )
    assert r.status_code == 200
    assert BUILTIN_INSTRUCTIONS["summarize"] in captured["prompt"]
    assert BUILTIN_INSTRUCTIONS["add_role"] in captured["prompt"]


def test_transform_unknown_mode_falls_back_to_best_judgement(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OLLAMA_TAGS_URL,
        json={"models": [{"name": "llama3:8b"}]},
    )
    httpx_mock.add_response(
        url=OLLAMA_GENERATE_URL,
        text="\n".join(
            [
                json.dumps({"response": "improved", "done": False}),
                json.dumps({"response": "", "done": True}),
            ]
        ),
    )

    r = client.post("/api/v1/transform", json={"prompt": "Test", "modes": ["nonexistent_mode"]})
    assert r.status_code == 200
    assert '"chunk"' in r.text


def test_transform_byok_fallback(client, httpx_mock: HTTPXMock):
    """When Ollama is down and a BYOK provider is configured, /transform routes through BYOK."""
    httpx_mock.add_response(
        url="https://api.openai.com/v1/models",
        json={"data": [{"id": "gpt-4o"}]},
    )
    sse_body = "".join(
        f"data: {json.dumps(frame)}\n\n"
        for frame in [
            {"choices": [{"delta": {"content": "byok transformed"}}]},
            {"choices": [{"delta": {"content": ""}}]},
        ]
    )
    sse_body += "data: [DONE]\n\n"
    httpx_mock.add_response(url="https://api.openai.com/v1/chat/completions", text=sse_body)

    r = client.post(
        "/api/v1/transform",
        json={
            "prompt": "Improve me",
            "byok": {"type": "openai", "apiKey": "sk-xxx", "model": "gpt-4o"},
        },
    )
    assert r.status_code == 200
    assert '"provider"' in r.text
    assert "byok transformed" in r.text
    assert '"done": true' in r.text


def test_transform_503_when_no_provider_available(client, httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)

    r = client.post("/api/v1/transform", json={"prompt": "hello"})
    assert r.status_code == 503


# ── integration: /transform-modes CRUD ──────────────────────────────────────


def test_list_transform_modes_includes_builtins(client):
    r = client.get("/api/v1/transform-modes")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    keys = [m["id"] for m in body["data"]]
    for builtin in BUILTIN_INSTRUCTIONS:
        assert builtin in keys
    assert all(m["isBuiltin"] for m in body["data"] if m["id"] in BUILTIN_INSTRUCTIONS)


def test_create_custom_transform_mode(client):
    r = client.post(
        "/api/v1/transform-modes",
        json={"name": "Make Funny", "instruction": "Rewrite the prompt to be humorous."},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["success"] is True
    mode = body["data"]
    assert mode["name"] == "Make Funny"
    assert mode["isBuiltin"] is False
    assert mode["id"]

    listing = client.get("/api/v1/transform-modes").json()["data"]
    assert any(m["id"] == mode["id"] and not m["isBuiltin"] for m in listing)


def test_delete_custom_transform_mode(client):
    created = client.post(
        "/api/v1/transform-modes",
        json={"name": "Temporary", "instruction": "Do something."},
    ).json()["data"]

    r = client.delete(f"/api/v1/transform-modes/{created['id']}")
    assert r.status_code == 200
    assert r.json()["success"] is True

    listing = client.get("/api/v1/transform-modes").json()["data"]
    assert all(m["id"] != created["id"] for m in listing)


def test_cannot_delete_builtin_mode(client):
    r = client.delete("/api/v1/transform-modes/summarize")
    assert r.status_code == 400
    assert "cannot be deleted" in r.json()["detail"].lower()
