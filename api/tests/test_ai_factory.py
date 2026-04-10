"""Unit tests for the AI provider factory."""
import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.services.ai.cloud import DEFAULT_WORKER_URL
from app.services.ai.factory import resolve_provider
from app.services.ai.provider import ProviderError

pytestmark = pytest.mark.asyncio

DEVICE_ID = "factory-test-device"


class _FakeRequest:
    """Minimal Request stub for factory tests."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        class _State:
            http = client

        self.app = type("App", (), {"state": _State()})()
        self.headers: dict[str, str] = {}


async def test_returns_ollama_when_reachable(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/tags",
        json={"models": [{"name": "llama3:8b"}]},
    )
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        provider, label, status = await resolve_provider(req, cloud_enabled=False, device_id=None)

    assert label == "ollama"
    assert status.reachable is True


async def test_raises_when_ollama_down_and_cloud_disabled(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"))
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        with pytest.raises(ProviderError):
            await resolve_provider(req, cloud_enabled=False, device_id=None)


async def test_raises_when_ollama_down_and_no_device_id(httpx_mock: HTTPXMock):
    httpx_mock.add_exception(httpx.ConnectError("refused"))
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        with pytest.raises(ProviderError):
            await resolve_provider(req, cloud_enabled=True, device_id=None)


async def test_returns_cloud_when_ollama_down_and_cloud_enabled(httpx_mock: HTTPXMock):
    # Ollama — unreachable
    httpx_mock.add_exception(httpx.ConnectError("refused"), url="http://127.0.0.1:11434/api/tags")
    # Cloud worker — reachable
    httpx_mock.add_response(
        url=f"{DEFAULT_WORKER_URL}/v1/health?device={DEVICE_ID}",
        json={
            "providers": ["groq", "gemini"],
            "quota": {"used": 0, "remaining": 50, "total": 50, "resetAt": "2026-04-11T00:00:00Z"},
        },
    )
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        provider, label, status = await resolve_provider(req, cloud_enabled=True, device_id=DEVICE_ID)

    assert label == "cloud"
    assert status.reachable is True


async def test_raises_when_both_providers_down(httpx_mock: HTTPXMock):
    # Ollama — unreachable
    httpx_mock.add_exception(httpx.ConnectError("refused"), url="http://127.0.0.1:11434/api/tags")
    # Cloud worker — unreachable
    httpx_mock.add_exception(
        httpx.ConnectError("refused"),
        url=f"{DEFAULT_WORKER_URL}/v1/health?device={DEVICE_ID}",
    )
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        with pytest.raises(ProviderError, match="No AI provider available"):
            await resolve_provider(req, cloud_enabled=True, device_id=DEVICE_ID)
