from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.schemas.ai import ByokProviderConfig

_camel = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class TransformRequest(BaseModel):
    model_config = _camel

    prompt: str
    modes: list[str] = []
    instruction: str | None = None
    model: str | None = None
    cloud_enabled: bool = False
    byok: ByokProviderConfig | None = None


class TransformModeCreate(BaseModel):
    model_config = _camel

    name: str
    instruction: str


class TransformModeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str
    instruction: str
    is_builtin: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
