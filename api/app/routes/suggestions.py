from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.engine import get_db
from app.schemas.envelope import ApiResponse
from app.schemas.suggestion import SuggestContext, SuggestionResponse
from app.services.suggestion_service import SuggestionService

router = APIRouter(prefix="/api/v1", tags=["suggestions"])


@router.post("/suggest", response_model=ApiResponse[list[SuggestionResponse]])
async def suggest(ctx: SuggestContext, request: Request, db: Session = Depends(get_db)):
    provider = None
    if ctx.use_ai:
        from app.services.ai.ollama import OllamaProvider
        provider = OllamaProvider(request.app.state.http)

    service = SuggestionService(db)
    results = await service.suggest(ctx, provider=provider)
    return ApiResponse.ok(results)
