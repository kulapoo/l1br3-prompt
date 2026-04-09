from fastapi import APIRouter

from app.schemas.envelope import ApiResponse

router = APIRouter(tags=["health"])


@router.get("/api/v1/health", response_model=ApiResponse[dict])
def health_check():
    return ApiResponse.ok({"status": "ok"})
