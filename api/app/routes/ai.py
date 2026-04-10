from fastapi import APIRouter, Query, Request

from app.schemas.ai import AiStatusResponse, CloudStatus, OllamaStatus
from app.schemas.envelope import ApiResponse
from app.services.ai.cloud import CloudFallbackProvider
from app.services.ai.ollama import OllamaProvider

router = APIRouter(prefix="/api/v1", tags=["ai"])


@router.get("/ai/status", response_model=ApiResponse[AiStatusResponse])
async def ai_status(
    request: Request,
    cloud: bool = Query(default=False, description="Also check cloud AI availability"),
):
    device_id = request.headers.get("x-device-id")

    # Always check Ollama.
    ollama_provider = OllamaProvider(request.app.state.http)
    ollama_status = await ollama_provider.health()

    # Optionally check cloud AI.
    cloud_status: CloudStatus | None = None
    if cloud and device_id:
        cloud_provider = CloudFallbackProvider(request.app.state.http, device_id)
        cloud_health = await cloud_provider.health()
        quota = cloud_provider.last_quota
        cloud_status = CloudStatus(
            reachable=cloud_health.reachable,
            quota_remaining=quota.remaining if quota else 0,
            quota_total=quota.total if quota else 50,
            reset_at=quota.reset_at if quota else None,
        )

    # Determine the active provider (Ollama wins ties).
    if ollama_status.reachable:
        active_provider = "ollama"
    elif cloud_status and cloud_status.reachable:
        active_provider = "cloud"
    else:
        active_provider = None

    return ApiResponse.ok(
        AiStatusResponse(
            ollama=OllamaStatus(reachable=ollama_status.reachable, models=ollama_status.models),
            cloud=cloud_status,
            provider=active_provider,
        )
    )
