"""Unit tests for the AI provider factory."""

import httpx
import pytest
from pytest_httpx import HTTPXMock

from app.schemas.ai import ByokProviderConfig
from app.services.ai.anthropic_provider import AnthropicProvider
from app.services.ai.cloud import DEFAULT_WORKER_URL
from app.services.ai.factory import resolve_provider
from app.services.ai.openai_provider import OpenAIProvider
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


# ---- BYOK branch ----

OPENAI_MODELS_URL = "https://api.openai.com/v1/models"
ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models"


async def test_byok_openai_resolves_when_reachable(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=OPENAI_MODELS_URL,
        json={"data": [{"id": "gpt-4o"}]},
    )
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        byok = ByokProviderConfig(type="openai", api_key="sk-xxx")
        provider, label, status = await resolve_provider(req, cloud_enabled=False, device_id=None, byok=byok)
    assert isinstance(provider, OpenAIProvider)
    assert label == "byok:openai"
    assert status.reachable is True
    assert "gpt-4o" in status.models


async def test_byok_anthropic_resolves_when_reachable(httpx_mock: HTTPXMock):
    httpx_mock.add_response(
        url=ANTHROPIC_MODELS_URL,
        json={"data": [{"id": "claude-3-5-sonnet-20241022"}]},
    )
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        byok = ByokProviderConfig(type="anthropic", api_key="sk-ant")
        provider, label, status = await resolve_provider(req, cloud_enabled=False, device_id=None, byok=byok)
    assert isinstance(provider, AnthropicProvider)
    assert label == "byok:anthropic"


async def test_byok_openai_compatible_uses_custom_base_url(httpx_mock: HTTPXMock):
    custom_models_url = "http://localhost:1234/v1/models"
    httpx_mock.add_response(url=custom_models_url, json={"data": [{"id": "local-model"}]})
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        byok = ByokProviderConfig(
            type="openai_compatible",
            api_key="any",
            base_url="http://localhost:1234/v1",
        )
        provider, label, status = await resolve_provider(req, cloud_enabled=False, device_id=None, byok=byok)
    assert isinstance(provider, OpenAIProvider)
    assert label == "byok:openai_compatible"
    assert "local-model" in status.models


async def test_byok_unreachable_raises_without_falling_through(httpx_mock: HTTPXMock):
    """Explicit BYOK that is unreachable must fail loudly, NOT silently downgrade to Ollama/Cloud.

    No Ollama/Cloud mocks are registered: if the code wrongly fell through, pytest_httpx would
    raise (no matching mock) and the ProviderError match below would not fire — surfacing the bug.
    """
    # BYOK health check fails
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=OPENAI_MODELS_URL)
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        byok = ByokProviderConfig(type="openai", api_key="sk-xxx")
        with pytest.raises(ProviderError, match="BYOK provider unreachable"):
            await resolve_provider(req, cloud_enabled=False, device_id=None, byok=byok)


async def test_byok_none_falls_through_to_existing_path(httpx_mock: HTTPXMock):
    """byok=None must preserve the existing Ollama→Cloud resolution unchanged."""
    httpx_mock.add_response(
        url="http://127.0.0.1:11434/api/tags",
        json={"models": [{"name": "llama3:8b"}]},
    )
    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        provider, label, status = await resolve_provider(req, cloud_enabled=False, device_id=None, byok=None)
    assert label == "ollama"
    assert status.reachable is True
