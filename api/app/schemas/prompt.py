from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.schemas.tag import TagCreate, TagResponse

_camel_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PromptCreate(BaseModel):
    model_config = _camel_config

    title: str
    content: str
    category: str = "General"
    is_favorite: bool = False
    tags: list[TagCreate] = []


class PromptUpdate(BaseModel):
    model_config = _camel_config

    title: str | None = None
    content: str | None = None
    category: str | None = None
    is_favorite: bool | None = None
    tags: list[TagCreate] | None = None


class PromptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: str
    title: str
    content: str
    category: str
    tags: list[TagResponse]
    usage_count: int = Field(serialization_alias="usageCount")
    last_used: str | None = Field(None, serialization_alias="lastUsed")
    is_favorite: bool = Field(serialization_alias="isFavorite")
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")
    deleted_at: datetime | None = Field(None, serialization_alias="deletedAt")


class PromptStatItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    usage_count: int = Field(serialization_alias="usageCount")
    last_used: str | None = Field(None, serialization_alias="lastUsed")


class CategoryCount(BaseModel):
    category: str | None
    count: int


class PromptStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_prompts: int = Field(serialization_alias="totalPrompts")
    total_copies: int = Field(serialization_alias="totalCopies")
    favorites_count: int = Field(serialization_alias="favoritesCount")
    top_used: list[PromptStatItem] = Field(serialization_alias="topUsed")
    stale: list[PromptStatItem]
    by_category: list[CategoryCount] = Field(serialization_alias="byCategory")
