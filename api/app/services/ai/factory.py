from fastapi import Request

from app.services.ai.cloud import CloudFallbackProvider
from app.services.ai.ollama import OllamaProvider
from app.services.ai.provider import AIProvider, ProviderError, ProviderStatus


async def resolve_provider(
    request: Request,
    *,
    cloud_enabled: bool,
    device_id: str | None,
) -> tuple[AIProvider, str, ProviderStatus]:
    """
    Return the best available AI provider for this request.

    Resolution order:
      1. OllamaProvider — if reachable locally.
      2. CloudFallbackProvider — if cloud_enabled=True and a device_id is present.
      3. Raise ProviderError — if neither is available.

    Returns a tuple of (provider, label, status) where label is "ollama" or "cloud"
    and status is the ProviderStatus from the successful health check (avoids a
    second health() call in the route layer for model resolution).
    """
    ollama = OllamaProvider(request.app.state.http)
    ollama_status = await ollama.health()
    if ollama_status.reachable:
        return ollama, "ollama", ollama_status

    if cloud_enabled and device_id:
        cloud = CloudFallbackProvider(request.app.state.http, device_id)
        cloud_status = await cloud.health()
        if cloud_status.reachable:
            return cloud, "cloud", cloud_status

    raise ProviderError(
        "No AI provider available. "
        "Install Ollama (https://ollama.com) or enable Cloud AI Fallback in Settings."
    )
