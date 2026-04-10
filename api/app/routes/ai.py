from fastapi import APIRouter, Request

from app.schemas.ai import AiStatusResponse, OllamaStatus
from app.schemas.envelope import ApiResponse
from app.services.ai.ollama import OllamaProvider

router = APIRouter(prefix="/api/v1", tags=["ai"])


@router.get("/ai/status", response_model=ApiResponse[AiStatusResponse])
async def ai_status(request: Request):
    provider = OllamaProvider(request.app.state.http)
    status = await provider.health()
    return ApiResponse.ok(
        AiStatusResponse(
            ollama=OllamaStatus(reachable=status.reachable, models=status.models),
            provider="ollama" if status.reachable else None,
        )
    )
