"""Unit tests for AnthropicProvider (Messages API + SSE event format)."""

import json

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ai.anthropic_provider import AnthropicProvider
from app.services.ai.provider import ProviderError

pytestmark = pytest.mark.asyncio

BASE = "https://api.anthropic.com/v1"
MODELS_URL = f"{BASE}/models"
MESSAGES_URL = f"{BASE}/messages"
API_KEY = "sk-ant-test"


def _anthropic_sse(events: list[tuple[str, dict]]) -> str:
    """Build Anthropic SSE body from (event_name, data) pairs."""
    body = ""
    for name, data in events:
        body += f"event: {name}\n"
        body += f"data: {json.dumps(data)}\n\n"
    return body


async def test_health_reachable_returns_model_ids(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=MODELS_URL,
        json={"data": [{"id": "claude-3-5-sonnet-20241022"}, {"id": "claude-3-opus"}]},
    )
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        status = await provider.health()
    assert status.reachable is True
    assert "claude-3-5-sonnet-20241022" in status.models


async def test_health_unreachable_swallows_exceptions(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=MODELS_URL)
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        status = await provider.health()
    assert status.reachable is False
    assert status.models == []


async def test_health_sends_anthropic_headers(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MODELS_URL, json={"data": []})
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        await provider.health()
    req = httpx_mock.get_requests()[0]
    assert req.headers["x-api-key"] == API_KEY
    assert req.headers["anthropic-version"] == "2023-06-01"


async def test_generate_collects_content_blocks_text(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=MESSAGES_URL,
        json={
            "content": [
                {"type": "text", "text": "Hello "},
                {"type": "text", "text": "world"},
            ],
        },
    )
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        text = await provider.generate("hi", model="claude-3-5-sonnet-20241022")
    assert text == "Hello world"


async def test_generate_sends_max_tokens(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=MESSAGES_URL,
        json={"content": [{"type": "text", "text": "x"}]},
    )
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        await provider.generate("hi", model="claude-3-5-sonnet-20241022")
    req = httpx_mock.get_requests()[0]
    payload = json.loads(req.content)
    assert payload["model"] == "claude-3-5-sonnet-20241022"
    assert "max_tokens" in payload
    assert payload["messages"] == [{"role": "user", "content": "hi"}]


async def test_stream_yields_content_block_delta_text(httpx_mock: HTTPXMock):
    body = _anthropic_sse(
        [
            ("ping", {"type": "ping"}),
            ("message_start", {"type": "message_start"}),
            ("content_block_start", {"type": "content_block_start"}),
            ("content_block_delta", {"delta": {"type": "text_delta", "text": "Hel"}}),
            ("content_block_delta", {"delta": {"type": "text_delta", "text": "lo"}}),
            ("content_block_delta", {"delta": {"type": "text_delta", "text": ""}}),  # empty ignored
            ("content_block_stop", {"type": "content_block_stop"}),
            ("message_delta", {"type": "message_delta"}),
            ("message_stop", {"type": "message_stop"}),
        ]
    )
    httpx_mock.add_response(url=MESSAGES_URL, text=body)
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        chunks = [c async for c in provider.stream("hi", model="claude-3-5-sonnet-20241022")]
    assert chunks == ["Hel", "lo"]


async def test_stream_sends_stream_true(httpx_mock: HTTPXMock):
    body = _anthropic_sse(
        [
            ("content_block_delta", {"delta": {"type": "text_delta", "text": "x"}}),
            ("message_stop", {"type": "message_stop"}),
        ]
    )
    httpx_mock.add_response(url=MESSAGES_URL, text=body)
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        _ = [c async for c in provider.stream("hi", model="claude-3-5-sonnet-20241022")]
    req = httpx_mock.get_requests()[0]
    payload = json.loads(req.content)
    assert payload["stream"] is True


async def test_generate_maps_401_to_auth_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MESSAGES_URL, status_code=401, json={"error": "bad"})
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="auth_error"):
            await provider.generate("hi", model="claude-3-5-sonnet-20241022")


async def test_generate_maps_429_to_rate_limited(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MESSAGES_URL, status_code=429, json={"error": "slow"})
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="rate_limited"):
            await provider.generate("hi", model="claude-3-5-sonnet-20241022")


async def test_generate_maps_404_to_model_not_found(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MESSAGES_URL, status_code=404, json={"error": "no model"})
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="model_not_found"):
            await provider.generate("hi", model="claude-3-5-sonnet-20241022")


async def test_stream_maps_401_to_auth_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MESSAGES_URL, status_code=401, json={"error": "bad"})
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="auth_error"):
            _ = [c async for c in provider.stream("hi", model="claude-3-5-sonnet-20241022")]


async def test_generate_maps_other_http_to_generic_provider_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=MESSAGES_URL, status_code=500, text="oops")
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError, match="anthropic error: 500"):
            await provider.generate("hi", model="claude-3-5-sonnet-20241022")


async def test_generate_maps_httpx_error_to_provider_error(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ReadTimeout("slow"), url=MESSAGES_URL)
    async with httpx.AsyncClient() as http:
        provider = AnthropicProvider(http, api_key=API_KEY)
        with pytest.raises(ProviderError):
            await provider.generate("hi", model="claude-3-5-sonnet-20241022")
