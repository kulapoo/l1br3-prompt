import httpx
from fastapi import Request
from sqlalchemy.orm import Session

from app.schemas.ai import ByokProviderConfig
from app.services.ai.ollama import OllamaProvider
from app.services.ai.openai_provider import OpenAIProvider
from app.services.ai.provider import AIProvider, ProviderError, ProviderStatus
from app.services.provider_service import ProviderKeyError, ProviderNotFoundError, ProviderService


async def resolve_provider(
    request: Request,
    *,
    byok: ByokProviderConfig | None = None,
    db: Session | None = None,
) -> tuple[AIProvider, str, ProviderStatus]:
    """
    Return the best available AI provider for this request.

    Resolution order:
      1. BYOK provider — if ``byok`` is supplied, it is the explicit user choice and
         MUST be used. Health-check it and fail loudly if unreachable (do NOT silently
         downgrade to Ollama — an explicit BYOK request deserves a clear error).

         M3: when ``byok.provider_id`` is set, the stored key is decrypted in-process
         via ``ProviderService`` (requires ``db``). The legacy ``byok.api_key`` direct
         path is retained for tests / backward compatibility.
      2. OllamaProvider — if reachable locally.
      3. Raise ProviderError — if neither is available.

    Returns a tuple of (provider, label, status) where label is "byok:{type}" or
    "ollama", and status is the ProviderStatus from the successful health check
    (avoids a second health() call in the route layer for model resolution).
    """
    http = request.app.state.http

    if byok is not None:
        provider, byok_label = await _byok_provider(http, byok, db)
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

    raise ProviderError("No AI provider available. Install Ollama (https://ollama.com) or configure a BYOK provider.")


async def _byok_provider(
    http: httpx.AsyncClient, byok: ByokProviderConfig, db: Session | None
) -> tuple[AIProvider, str]:
    """Construct the provider for a BYOK config. Returns (provider, label).

    M3: ``provider_id`` takes precedence and resolves the stored, encrypted key.
    The direct ``api_key`` path remains for tests / legacy clients.
    """
    if byok.provider_id:
        if db is None:
            raise ProviderError("A db session is required to resolve provider_id")
        service = ProviderService(db)
        try:
            resolved = service.resolve_for_inference(byok.provider_id)
        except ProviderNotFoundError as exc:
            raise ProviderError(str(exc)) from exc
        except ProviderKeyError as exc:
            raise ProviderError(str(exc)) from exc
        return _construct(http, resolved.type, resolved.api_key, resolved.base_url)

    # Legacy direct-key path: type/api_key are both guaranteed non-None by the
    # ByokProviderConfig validator (one of provider_id/api_key is set).
    assert byok.type is not None and byok.api_key is not None
    return _construct(http, byok.type, byok.api_key, byok.base_url)


def _construct(http: httpx.AsyncClient, type_: str, api_key: str, base_url: str | None) -> tuple[AIProvider, str]:
    # openai + openai_compatible share the OpenAI Chat Completions contract.
    return OpenAIProvider(http, api_key=api_key, base_url=base_url), f"byok:{type_}"
