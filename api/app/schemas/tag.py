from pydantic import BaseModel, ConfigDict


class TagCreate(BaseModel):
    name: str
    color: str = "#6B7280"


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    color: str
