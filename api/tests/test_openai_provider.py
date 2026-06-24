"""Unit tests for OpenAIProvider (covers openai + openai_compatible)."""

import json

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ai.openai_provider import OpenAIProvider
from app.services.ai.provider import ProviderError

pytestmark = pytest.mark.asyncio

BASE = "https://api.openai.com/v1"
MODELS_URL = f"{BASE}/models"
CHAT_URL = f"{BASE}/chat/completions"
API_KEY = "sk-test-key"


def _sse_lines(frames: list[dict]) -> str:
    """Build an OpenAI-style SSE body. Append the [DONE] sentinel."""
    body = ""
    for f in frames:
        body += f"data: {json.dumps(f)}\n\n"
    body += "data: [DONE]\n\n"
    return body


async def test_health_reachable_returns_model_ids(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=MODELS_URL,
        json={"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}]},
    )
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        status = await provider.health()
    assert status.reachable is True
    assert "gpt-4o" in status.models
    assert "gpt-4o-mini" in status.models


async def test_health_unreachable_swallows_exceptions(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=MODELS_URL)
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        status = await provider.health()
    assert status.reachable is False
    assert status.models == []


async def test_health_sends_authorization_header(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MODELS_URL, json={"data": []})
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        await provider.health()
    req = httpx_mock.get_requests()[0]
    assert req.headers["authorization"] == f"Bearer {API_KEY}"


async def test_generate_returns_full_text(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=CHAT_URL,
        json={"choices": [{"message": {"content": "hello world"}}]},
    )
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        text = await provider.generate("hi", model="gpt-4o")
    assert text == "hello world"


async def test_stream_yields_delta_content_chunks(httpx_mock: HTTPXMock):
    body = _sse_lines(
        [
            {"choices": [{"delta": {"content": "Hel"}}]},
            {"choices": [{"delta": {"content": "lo"}}]},
            {"choices": [{"delta": {}}]},  # empty delta ignored
            {"choices": [{"delta": {"role": "assistant"}}]},  # no content ignored
        ]
    )
    httpx_mock.add_response(url=CHAT_URL, text=body)
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        chunks = [c async for c in provider.stream("hi", model="gpt-4o")]
    assert chunks == ["Hel", "lo"]


async def test_stream_sends_stream_true(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=CHAT_URL, text=_sse_lines([{"choices": [{"delta": {"content": "x"}}]}]))
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        _ = [c async for c in provider.stream("hi", model="gpt-4o")]
    req = httpx_mock.get_requests()[0]
    payload = json.loads(req.content)
    assert payload["stream"] is True
    assert payload["model"] == "gpt-4o"


async def test_generate_maps_401_to_auth_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=CHAT_URL, status_code=401, json={"error": {"message": "bad key"}})
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="auth_error"):
            await provider.generate("hi", model="gpt-4o")


async def test_generate_maps_429_to_rate_limited(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=CHAT_URL, status_code=429, json={"error": {"message": "slow down"}})
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="rate_limited"):
            await provider.generate("hi", model="gpt-4o")


async def test_generate_maps_404_to_model_not_found(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=CHAT_URL, status_code=404, json={"error": {"message": "no model"}})
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="model_not_found"):
            await provider.generate("hi", model="gpt-4o")


async def test_stream_maps_401_to_auth_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=CHAT_URL, status_code=401, json={"error": {"message": "bad key"}})
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="auth_error"):
            _ = [c async for c in provider.stream("hi", model="gpt-4o")]


async def test_generate_maps_other_http_to_generic_provider_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=CHAT_URL, status_code=500, text="oops")
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="openai error: 500"):
            await provider.generate("hi", model="gpt-4o")


async def test_generate_maps_httpx_error_to_provider_error(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ReadTimeout("slow"), url=CHAT_URL)
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError):
            await provider.generate("hi", model="gpt-4o")


async def test_openai_compatible_uses_custom_base_url(httpx_mock: HTTPXMock):
    custom_base = "http://localhost:1234/v1"
    httpx_mock.add_response(url=f"{custom_base}/models", json={"data": [{"id": "local-model"}]})
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key="any", base_url=custom_base)
        status = await provider.health()
    assert status.reachable is True
    assert "local-model" in status.models


async def test_api_key_never_in_models_response_data(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    async with httpx.AsyncClient() as http:
        provider = OpenAIProvider(http, api_key=API_KEY)
        status = await provider.health()
    assert API_KEY not in json.dumps(status.__dict__)
