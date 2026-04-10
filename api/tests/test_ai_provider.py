import json

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ai.ollama import OllamaProvider
from app.services.ai.provider import ProviderError

pytestmark = pytest.mark.asyncio


# ── health ─────────────────────────────────────────────────────────────────────


async def test_health_reachable(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/tags",
        json={"models": [{"name": "llama3:8b"}, {"name": "mistral:latest"}]},
    )
    async with httpx.AsyncClient() as client:
        provider = OllamaProvider(client)
        status = await provider.health()

    assert status.reachable is True
    assert "llama3:8b" in status.models
    assert "mistral:latest" in status.models


async def test_health_unreachable(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"))
    async with httpx.AsyncClient() as client:
        provider = OllamaProvider(client)
        status = await provider.health()

    assert status.reachable is False
    assert status.models == []


async def test_health_empty_models(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url="http://127.0.0.1:11434/api/tags", json={"models": []})
    async with httpx.AsyncClient() as client:
        provider = OllamaProvider(client)
        status = await provider.health()

    assert status.reachable is True
    assert status.models == []


# ── generate ───────────────────────────────────────────────────────────────────


async def test_generate_returns_response(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/generate",
        json={"response": "Hello, world!", "done": True},
    )
    async with httpx.AsyncClient() as client:
        provider = OllamaProvider(client)
        result = await provider.generate("Say hi", model="llama3:8b")

    assert result == "Hello, world!"


async def test_generate_raises_provider_error_on_http_error(httpx_mock: HTTPXMock):
    httpx_mock.add_response(url="http://127.0.0.1:11434/api/generate", status_code=500)
    async with httpx.AsyncClient() as client:
        provider = OllamaProvider(client)
        with pytest.raises(ProviderError):
            await provider.generate("Say hi", model="llama3:8b")


# ── stream ─────────────────────────────────────────────────────────────────────


async def test_stream_yields_chunks_in_order(httpx_mock: HTTPXMock):
    ndjson = "\n".join([
        json.dumps({"response": "Hello", "done": False}),
        json.dumps({"response": ", ", "done": False}),
        json.dumps({"response": "world!", "done": False}),
        json.dumps({"response": "", "done": True}),
    ])
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/generate",
        text=ndjson,
    )
    async with httpx.AsyncClient() as client:
        provider = OllamaProvider(client)
        chunks = [chunk async for chunk in provider.stream("Say hi", model="llama3:8b")]

    assert chunks == ["Hello", ", ", "world!"]


async def test_stream_raises_provider_error_on_connection_failure(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"))
    async with httpx.AsyncClient() as client:
        provider = OllamaProvider(client)
        with pytest.raises(ProviderError):
            async for _ in provider.stream("Say hi", model="llama3:8b"):
                pass
