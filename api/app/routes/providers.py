from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.engine import get_db
from app.schemas.envelope import ApiResponse
from app.schemas.provider import ProviderCreate, ProviderRead, ProviderUpdate
from app.services.provider_service import ProviderService

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])


def _to_read(model) -> ProviderRead:
    # ProviderRead deliberately omits the key; only has_key is exposed.
    return ProviderRead(
        id=model.id,
        type=model.type,
        base_url=model.base_url,
        has_key=bool(model.encrypted_api_key),
    )


@router.get("", response_model=ApiResponse[list[ProviderRead]])
def list_providers(db: Session = Depends(get_db)):
    service = ProviderService(db)
    return ApiResponse.ok([_to_read(m) for m in service.list()])


@router.post("", response_model=ApiResponse[ProviderRead], status_code=status.HTTP_201_CREATED)
def create_provider(data: ProviderCreate, db: Session = Depends(get_db)):
    service = ProviderService(db)
    model = service.create(type_=data.type, base_url=data.base_url, api_key=data.api_key)
    db.commit()
    db.refresh(model)
    return ApiResponse.ok(_to_read(model))


@router.get("/{id}", response_model=ApiResponse[ProviderRead])
def get_provider(id: str, db: Session = Depends(get_db)):
    service = ProviderService(db)
    model = service.get(id)
    if model is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return ApiResponse.ok(_to_read(model))


@router.patch("/{id}", response_model=ApiResponse[ProviderRead])
def update_provider(id: str, data: ProviderUpdate, db: Session = Depends(get_db)):
    service = ProviderService(db)
    model = service.update(id, base_url=data.base_url, api_key=data.api_key)
    if model is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.commit()
    db.refresh(model)
    return ApiResponse.ok(_to_read(model))


@router.delete("/{id}", response_model=ApiResponse[None])
def delete_provider(id: str, db: Session = Depends(get_db)):
    service = ProviderService(db)
    if not service.delete(id):
        raise HTTPException(status_code=404, detail="Provider not found")
    db.commit()
    return ApiResponse.ok(None)
