from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.engine import get_db
from app.schemas.envelope import ApiResponse
from app.services.category_service import CategoryService

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


@router.get("", response_model=ApiResponse[list[str]])
def list_categories(db: Session = Depends(get_db)):
    service = CategoryService(db)
    return ApiResponse.ok(service.get_all_categories())
