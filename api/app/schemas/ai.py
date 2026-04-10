from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_camel = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OllamaStatus(BaseModel):
    model_config = _camel

    reachable: bool
    models: list[str] = []


class AiStatusResponse(BaseModel):
    model_config = _camel

    ollama: OllamaStatus
    provider: str | None = None  # "ollama" | null


class GenerateRequest(BaseModel):
    model_config = _camel

    prompt: str
    model: str | None = None
    options: dict | None = None


class ProcessTemplateRequest(BaseModel):
    model_config = _camel

    template: str
    variables: dict[str, str] = {}


class ProcessTemplateResponse(BaseModel):
    model_config = _camel

    rendered: str
    variables: list[str]
