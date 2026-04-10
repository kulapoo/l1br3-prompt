"""Unit tests for CloudFallbackProvider."""
import json

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ai.cloud import CloudFallbackProvider
from app.services.ai.provider import ProviderError

pytestmark = pytest.mark.asyncio

WORKER_URL = "https://cloud-ai.l1br3-prompt.workers.dev"
DEVICE_ID = "test-device-123"


def _provider(client: httpx.AsyncClient) -> CloudFallbackProvider:
    return CloudFallbackProvider(client, DEVICE_ID, base_url=WORKER_URL)


def _sse_body(*frames: dict) -> str:
    return "".join(f"data: {json.dumps(f)}\n\n" for f in frames)


# ── health ─────────────────────────────────────────────────────────────────────


async def test_health_reachable(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=f"{WORKER_URL}/v1/health?device={DEVICE_ID}",
        json={
            "providers": ["groq", "gemini"],
            "quota": {"used": 3, "remaining": 47, "total": 50, "resetAt": "2026-04-11T00:00:00Z"},
        },
    )
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        status = await provider.health()

    assert status.reachable is True
    assert status.models == ["cloud-default"]
    assert provider.last_quota is not None
    assert provider.last_quota.remaining == 47
    assert provider.last_quota.total == 50


async def test_health_unreachable(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=f"{WORKER_URL}/v1/health?device={DEVICE_ID}")
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        status = await provider.health()

    assert status.reachable is False
    assert provider.last_quota is None


async def test_health_server_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url=f"{WORKER_URL}/v1/health?device={DEVICE_ID}", status_code=500)
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        status = await provider.health()

    assert status.reachable is False


# ── generate ───────────────────────────────────────────────────────────────────


async def test_generate_returns_full_response(httpx_mock: HTTPXMock):
    sse = _sse_body(
        {"meta": {"provider": "groq"}},
        {"chunk": "Hello"},
        {"chunk": ", world!"},
        {"done": True},
    )
    httpx_mock.add_response(url=f"{WORKER_URL}/v1/generate", text=sse)
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        result = await provider.generate("Say hi", model="cloud-default")

    assert result == "Hello, world!"


async def test_generate_raises_on_quota_exceeded(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=f"{WORKER_URL}/v1/generate",
        status_code=429,
        json={"error": "quota_exceeded", "resetAt": "2026-04-11T00:00:00Z"},
    )
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        with pytest.raises(ProviderError, match="quota_exceeded"):
            await provider.generate("Say hi", model="cloud-default")


async def test_generate_raises_on_worker_error_frame(httpx_mock: HTTPXMock):
    sse = _sse_body({"error": "Both providers failed"})
    httpx_mock.add_response(url=f"{WORKER_URL}/v1/generate", text=sse)
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        with pytest.raises(ProviderError, match="Worker error"):
            await provider.generate("Say hi", model="cloud-default")


# ── stream ─────────────────────────────────────────────────────────────────────


async def test_stream_yields_chunks(httpx_mock: HTTPXMock):
    sse = _sse_body(
        {"meta": {"provider": "groq"}},
        {"chunk": "foo"},
        {"chunk": " bar"},
        {"done": True},
    )
    httpx_mock.add_response(url=f"{WORKER_URL}/v1/generate", text=sse)
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        chunks = [c async for c in provider.stream("Say hi", model="cloud-default")]

    assert chunks == ["foo", " bar"]


async def test_stream_raises_on_quota_exceeded(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=f"{WORKER_URL}/v1/generate",
        status_code=429,
        json={"error": "quota_exceeded", "resetAt": "2026-04-11T00:00:00Z"},
    )
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        with pytest.raises(ProviderError, match="quota_exceeded"):
            async for _ in provider.stream("Say hi", model="cloud-default"):
                pass


async def test_stream_raises_on_connection_failure(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=f"{WORKER_URL}/v1/generate")
    async with httpx.AsyncClient() as client:
        provider = _provider(client)
        with pytest.raises(ProviderError):
            async for _ in provider.stream("Say hi", model="cloud-default"):
                pass
