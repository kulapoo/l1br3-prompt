from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.engine import get_db
from app.schemas.envelope import ApiResponse
from app.schemas.suggestion import SuggestContext, SuggestionResponse
from app.services.ai.factory import resolve_provider
from app.services.ai.provider import ProviderError
from app.services.suggestion_service import SuggestionService

router = APIRouter(prefix="/api/v1", tags=["suggestions"])


@router.post("/suggest", response_model=ApiResponse[list[SuggestionResponse]])
async def suggest(ctx: SuggestContext, request: Request, db: Session = Depends(get_db)):
    provider = None
    if ctx.use_ai:
        device_id = request.headers.get("x-device-id")
        # Infer cloud_enabled from the presence of a cloud header flag.
        cloud_enabled = request.headers.get("x-cloud-enabled", "false").lower() == "true"
        try:
            provider, _ = await resolve_provider(
                request,
                cloud_enabled=cloud_enabled,
                device_id=device_id,
            )
        except ProviderError:
            # No AI available — fall through to rule-based suggestions only.
            provider = None

    service = SuggestionService(db)
    results = await service.suggest(ctx, provider=provider)
    return ApiResponse.ok(results)
