"""Tests for /enhance endpoint and build_enhance_prompt helper."""
import json

import httpx
from pytest_httpx import HTTPXMock

from app.routes.enhance import ENHANCE_INSTRUCTIONS, build_enhance_prompt
from app.schemas.ai import EnhanceRequest
from app.services.ai.cloud import DEFAULT_WORKER_URL

DEVICE_ID = "enhance-test-device"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate"
WORKER_HEALTH_URL = f"{DEFAULT_WORKER_URL}/v1/health?device={DEVICE_ID}"
WORKER_GENERATE_URL = f"{DEFAULT_WORKER_URL}/v1/generate"


# ── unit: build_enhance_prompt ──────────────────────────────────────────────


def test_build_enhance_prompt_chip_mode():
    req = EnhanceRequest(prompt="Write a summary", mode="summarize")
    result = build_enhance_prompt(req)
    assert ENHANCE_INSTRUCTIONS["summarize"] in result
    assert "Write a summary" in result
    assert "PROMPT TO ENHANCE" in result
    assert "Return ONLY" in result


def test_build_enhance_prompt_best_judgement_mode():
    req = EnhanceRequest(prompt="Test prompt", mode="best_judgement")
    result = build_enhance_prompt(req)
    assert ENHANCE_INSTRUCTIONS["best_judgement"] in result
    assert "Test prompt" in result


def test_build_enhance_prompt_custom_mode_uses_instruction():
    req = EnhanceRequest(prompt="Fix this", mode="custom", instruction="Make it shorter")
    result = build_enhance_prompt(req)
    assert "Make it shorter" in result
    assert "Fix this" in result
    assert ENHANCE_INSTRUCTIONS["best_judgement"] not in result


def test_build_enhance_prompt_unknown_mode_falls_back_to_best_judgement():
    req = EnhanceRequest(prompt="Test", mode="nonexistent_mode")
    result = build_enhance_prompt(req)
    assert ENHANCE_INSTRUCTIONS["best_judgement"] in result


def test_build_enhance_prompt_all_chip_modes():
    for mode in ("summarize", "concise", "add_role", "chain_of_thought", "output_format", "best_judgement"):
        req = EnhanceRequest(prompt="hello", mode=mode)
        result = build_enhance_prompt(req)
        assert ENHANCE_INSTRUCTIONS[mode] in result, f"mode={mode} not found in prompt"


# ── integration: /enhance endpoint ─────────────────────────────────────────


def test_enhance_503_when_ollama_unreachable(client, httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)
    r = client.post("/api/v1/enhance", json={"prompt": "Hello"})
    assert r.status_code == 503


def test_enhance_streams_sse_frames_for_chip_mode(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OLLAMA_TAGS_URL,
        json={"models": [{"name": "llama3:8b"}]},
    )
    ndjson = "\n".join([
        json.dumps({"response": "You", "done": False}),
        json.dumps({"response": " are", "done": False}),
        json.dumps({"response": "", "done": True}),
    ])
    httpx_mock.add_response(url=OLLAMA_GENERATE_URL, text=ndjson)

    r = client.post("/api/v1/enhance", json={"prompt": "Write docs", "mode": "add_role"})
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


def test_enhance_custom_mode_with_instruction(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OLLAMA_TAGS_URL,
        json={"models": [{"name": "llama3:8b"}]},
    )
    httpx_mock.add_response(
        url=OLLAMA_GENERATE_URL,
        text="\n".join([
            json.dumps({"response": "ok", "done": False}),
            json.dumps({"response": "", "done": True}),
        ]),
    )

    r = client.post(
        "/api/v1/enhance",
        json={"prompt": "Describe the sky", "mode": "custom", "instruction": "Add emojis"},
    )
    assert r.status_code == 200
    frames = [
        json.loads(line[6:])
        for line in r.text.splitlines()
        if line.startswith("data: ")
    ]
    chunk_frames = [f for f in frames if "chunk" in f]
    assert chunk_frames == [{"chunk": "ok"}]


def test_enhance_unknown_mode_falls_back_to_best_judgement(client, httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OLLAMA_TAGS_URL,
        json={"models": [{"name": "llama3:8b"}]},
    )
    httpx_mock.add_response(
        url=OLLAMA_GENERATE_URL,
        text="\n".join([
            json.dumps({"response": "improved", "done": False}),
            json.dumps({"response": "", "done": True}),
        ]),
    )

    r = client.post("/api/v1/enhance", json={"prompt": "Test", "mode": "nonexistent_mode"})
    assert r.status_code == 200
    text = r.text
    assert '"chunk"' in text


def test_enhance_cloud_fallback(client, httpx_mock: HTTPXMock):
    """When Ollama is down and cloudEnabled=true, /enhance routes through the cloud worker."""
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)
    httpx_mock.add_response(
        url=WORKER_HEALTH_URL,
        json={
            "providers": ["groq"],
            "quota": {"used": 0, "remaining": 50, "total": 50, "resetAt": ""},
        },
    )
    sse_body = "".join(
        f"data: {json.dumps(f)}\n\n"
        for f in [
            {"meta": {"provider": "groq"}},
            {"chunk": "cloud enhanced"},
            {"done": True},
        ]
    )
    httpx_mock.add_response(url=WORKER_GENERATE_URL, text=sse_body)

    r = client.post(
        "/api/v1/enhance",
        json={"prompt": "Improve me", "cloudEnabled": True},
        headers={"X-Device-Id": DEVICE_ID},
    )
    assert r.status_code == 200
    assert '"provider"' in r.text
    assert "cloud enhanced" in r.text
    assert '"done": true' in r.text


def test_enhance_503_when_both_providers_down(client, httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OLLAMA_TAGS_URL)

    r = client.post("/api/v1/enhance", json={"prompt": "hello", "cloudEnabled": False})
    assert r.status_code == 503
