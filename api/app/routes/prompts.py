from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.engine import get_db
from app.schemas.envelope import ApiResponse
from app.schemas.prompt import PromptCreate, PromptResponse, PromptUpdate
from app.schemas.tag import TagCreate
from app.services.prompt_service import PromptService

router = APIRouter(prefix="/api/v1/prompts", tags=["prompts"])


def _to_response(prompt) -> PromptResponse:
    return PromptResponse.model_validate(prompt)


@router.get("", response_model=ApiResponse[list[PromptResponse]])
def list_prompts(
    search: str | None = None,
    tag: str | None = None,
    category: str | None = None,
    favorite: bool | None = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    service = PromptService(db)
    items, total = service.list_prompts(
        search=search,
        tag=tag,
        category=category,
        is_favorite=favorite,
        page=page,
        limit=limit,
    )
    return ApiResponse.ok(
        [_to_response(p) for p in items],
        metadata={"total": total, "page": page, "limit": limit},
    )


@router.post("", response_model=ApiResponse[PromptResponse], status_code=status.HTTP_201_CREATED)
def create_prompt(data: PromptCreate, db: Session = Depends(get_db)):
    service = PromptService(db)
    prompt = service.create_prompt(data)
    return ApiResponse.ok(_to_response(prompt))


@router.get("/{id}", response_model=ApiResponse[PromptResponse])
def get_prompt(id: str, db: Session = Depends(get_db)):
    service = PromptService(db)
    prompt = service.get_prompt(id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return ApiResponse.ok(_to_response(prompt))


@router.put("/{id}", response_model=ApiResponse[PromptResponse])
def update_prompt(id: str, data: PromptUpdate, db: Session = Depends(get_db)):
    service = PromptService(db)
    prompt = service.update_prompt(id, data)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return ApiResponse.ok(_to_response(prompt))


@router.delete("/{id}", response_model=ApiResponse[None])
def delete_prompt(id: str, db: Session = Depends(get_db)):
    service = PromptService(db)
    deleted = service.delete_prompt(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return ApiResponse.ok(None)


@router.post("/{id}/copy", response_model=ApiResponse[PromptResponse])
def copy_prompt(id: str, db: Session = Depends(get_db)):
    service = PromptService(db)
    prompt = service.copy_prompt(id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return ApiResponse.ok(_to_response(prompt))


@router.post("/{id}/tags", response_model=ApiResponse[PromptResponse])
def add_tags(id: str, tags: list[TagCreate], db: Session = Depends(get_db)):
    service = PromptService(db)
    prompt = service.add_tags(id, tags)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return ApiResponse.ok(_to_response(prompt))
