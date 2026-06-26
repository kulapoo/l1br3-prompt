from sqlalchemy import LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class AIProviderModel(UUIDMixin, TimestampMixin, Base):
    """A user-configured BYOK AI provider with an encrypted API key.

    Only the *secret* (api_key) lives here, encrypted at rest with Fernet keyed
    by ``L1BR3_MASTER_KEY``. Non-secret provider config (label, model list,
    enabled flag, role assignments) stays in the extension's
    ``browser.storage.local`` as F13 built it — this table is the minimal
    server-side secret store, not a full provider catalog.
    """

    __tablename__ = "ai_providers"

    type: Mapped[str] = mapped_column(String(50), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    encrypted_api_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
