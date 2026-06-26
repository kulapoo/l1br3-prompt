"""Provider service — encrypts on write, decrypts only for inference.

The plaintext key lives in memory only: on the write path it is encrypted
before hitting the repo, and on the read path it is decrypted only inside
``resolve_for_inference`` which returns it straight to the AI factory. Read
responses going back over the wire use ``has_key`` only (see ProviderRead).
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.ai_provider import AIProviderModel
from app.repositories.provider_repo import ProviderRepository
from app.services.security.crypto import decrypt, encrypt


class ProviderNotFoundError(Exception):
    pass


class ProviderKeyError(Exception):
    """Raised when at-rest decryption fails — typically a rotated master key."""


@dataclass(frozen=True)
class ResolvedProvider:
    """Decrypted provider material for a single inference request."""

    type: str
    api_key: str
    base_url: str | None


class ProviderService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ProviderRepository(db)

    def list(self) -> list[AIProviderModel]:
        return self.repo.find_all()

    def get(self, id: str) -> AIProviderModel | None:
        return self.repo.find_by_id(id)

    def create(self, *, type_: str, base_url: str | None, api_key: str) -> AIProviderModel:
        return self.repo.create(type_=type_, base_url=base_url, encrypted_api_key=encrypt(api_key))

    def update(
        self,
        id: str,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> AIProviderModel | None:
        model = self.repo.find_by_id(id)
        if model is None:
            return None
        encrypted = encrypt(api_key) if api_key is not None else None
        return self.repo.update(model, base_url=base_url, encrypted_api_key=encrypted)

    def delete(self, id: str) -> bool:
        model = self.repo.find_by_id(id)
        if model is None:
            return False
        self.repo.delete(model)
        return True

    def resolve_for_inference(self, provider_id: str) -> ResolvedProvider:
        """Decrypt and return provider material for one inference call."""
        model = self.repo.find_by_id(provider_id)
        if model is None:
            raise ProviderNotFoundError(f"No provider with id={provider_id}")
        try:
            api_key = decrypt(model.encrypted_api_key)
        except Exception as exc:
            raise ProviderKeyError(
                "Failed to decrypt stored API key. The L1BR3_MASTER_KEY may have changed "
                "since this key was saved — re-enter the provider key."
            ) from exc
        return ResolvedProvider(type=model.type, api_key=api_key, base_url=model.base_url)
