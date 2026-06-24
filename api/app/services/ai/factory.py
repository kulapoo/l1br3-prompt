import httpx
from fastapi import Request

from app.schemas.ai import ByokProviderConfig
from app.services.ai.anthropic_provider import AnthropicProvider
from app.services.ai.cloud import CloudFallbackProvider
from app.services.ai.ollama import OllamaProvider
from app.services.ai.openai_provider import OpenAIProvider
from app.services.ai.provider import AIProvider, ProviderError, ProviderStatus


async def resolve_provider(
    request: Request,
    *,
    cloud_enabled: bool,
    device_id: str | None,
    byok: ByokProviderConfig | None = None,
) -> tuple[AIProvider, str, ProviderStatus]:
    """
    Return the best available AI provider for this request.

    Resolution order:
      1. BYOK provider — if ``byok`` is supplied, it is the explicit user choice and
         MUST be used. Health-check it and fail loudly if unreachable (do NOT silently
         downgrade to Ollama/Cloud — an explicit BYOK request deserves a clear error).
      2. OllamaProvider — if reachable locally.
      3. CloudFallbackProvider — if cloud_enabled=True and a device_id is present.
      4. Raise ProviderError — if neither is available.

    Returns a tuple of (provider, label, status) where label is "byok:{type}", "ollama",
    or "cloud", and status is the ProviderStatus from the successful health check
    (avoids a second health() call in the route layer for model resolution).
    """
    http = request.app.state.http

    if byok is not None:
        provider, byok_label = _byok_provider(http, byok)
        status = await provider.health()
        if not status.reachable:
            raise ProviderError(
                f"BYOK provider unreachable: {byok_label} did not respond to a health check. "
                "Verify the API key, base URL, and network reachability."
            )
        return provider, byok_label, status

    ollama = OllamaProvider(http)
    ollama_status = await ollama.health()
    if ollama_status.reachable:
        return ollama, "ollama", ollama_status

    if cloud_enabled and device_id:
        cloud = CloudFallbackProvider(http, device_id)
        cloud_status = await cloud.health()
        if cloud_status.reachable:
            return cloud, "cloud", cloud_status

    raise ProviderError(
        "No AI provider available. Install Ollama (https://ollama.com) or enable Cloud AI Fallback in Settings."
    )


def _byok_provider(http: httpx.AsyncClient, byok: ByokProviderConfig) -> tuple[AIProvider, str]:
    """Construct the provider for a BYOK config. Returns (provider, label)."""
    if byok.type == "anthropic":
        return AnthropicProvider(http, api_key=byok.api_key, base_url=byok.base_url), "byok:anthropic"
    # openai + openai_compatible share the OpenAI Chat Completions contract.
    return OpenAIProvider(http, api_key=byok.api_key, base_url=byok.base_url), f"byok:{byok.type}"
