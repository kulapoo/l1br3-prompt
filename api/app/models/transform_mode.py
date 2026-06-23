from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class TransformMode(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "transform_modes"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    instruction: Mapped[str] = mapped_column(String, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
