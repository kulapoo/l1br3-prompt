from sqlalchemy.orm import Session

from app.models.ai_provider import AIProviderModel


class ProviderRepository:
    """Pure SQL access to the ai_providers table.

    Returns ORM rows whose ``encrypted_api_key`` is opaque ciphertext. Decryption
    is the service layer's concern, never the repo's.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def find_all(self) -> list[AIProviderModel]:
        return self.db.query(AIProviderModel).order_by(AIProviderModel.created_at.asc()).all()

    def find_by_id(self, id: str) -> AIProviderModel | None:
        return self.db.query(AIProviderModel).filter(AIProviderModel.id == id).first()

    def create(self, *, type_: str, base_url: str | None, encrypted_api_key: bytes) -> AIProviderModel:
        model = AIProviderModel(type=type_, base_url=base_url, encrypted_api_key=encrypted_api_key)
        self.db.add(model)
        self.db.flush()
        self.db.refresh(model)
        return model

    def update(
        self,
        model: AIProviderModel,
        *,
        base_url: str | None = None,
        encrypted_api_key: bytes | None = None,
    ) -> AIProviderModel:
        if base_url is not None:
            model.base_url = base_url
        if encrypted_api_key is not None:
            model.encrypted_api_key = encrypted_api_key
        self.db.flush()
        return model

    def delete(self, model: AIProviderModel) -> None:
        self.db.delete(model)
        self.db.flush()
