from typing import Literal

from fastapi import APIRouter, Request

from app.schemas.ai import AiStatusResponse, OllamaStatus
from app.schemas.envelope import ApiResponse
from app.services.ai.ollama import OllamaProvider

router = APIRouter(prefix="/api/v1", tags=["ai"])


@router.get("/ai/status", response_model=ApiResponse[AiStatusResponse])
async def ai_status(request: Request):
    ollama_provider = OllamaProvider(request.app.state.http)
    ollama_status = await ollama_provider.health()

    active_provider: Literal["ollama"] | None = "ollama" if ollama_status.reachable else None

    return ApiResponse.ok(
        AiStatusResponse(
            ollama=OllamaStatus(reachable=ollama_status.reachable, models=ollama_status.models),
            provider=active_provider,
        )
    )
