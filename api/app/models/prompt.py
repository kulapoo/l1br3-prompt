from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin, TimestampMixin
from app.models.tag import Tag

prompt_tags = Table(
    "prompt_tags",
    Base.metadata,
    Column("prompt_id", String(36), ForeignKey("prompts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Prompt(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "prompts"

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="General")
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_used: Mapped[str | None] = mapped_column(String, nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    tags: Mapped[list[Tag]] = relationship(
        Tag, secondary=prompt_tags, lazy="selectin"
    )
