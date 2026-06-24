from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_camel = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OllamaStatus(BaseModel):
    model_config = _camel

    reachable: bool
    models: list[str] = []


class CloudStatus(BaseModel):
    model_config = _camel

    reachable: bool
    quota_remaining: int = 0
    quota_total: int = 50
    reset_at: str | None = None


class AiStatusResponse(BaseModel):
    model_config = _camel

    ollama: OllamaStatus
    cloud: CloudStatus | None = None
    provider: Literal["ollama", "cloud"] | None = None


ByokProviderType = Literal["openai", "anthropic", "openai_compatible"]


class ByokProviderConfig(BaseModel):
    """Per-request bring-your-own-key provider config.

    The browser sends this so the backend can proxy to the user's own provider.
    Milestone 3 will replace per-request key transport with encrypted server storage.
    """

    model_config = _camel

    type: ByokProviderType
    api_key: str
    base_url: str | None = None
    model: str | None = None


class GenerateRequest(BaseModel):
    model_config = _camel

    prompt: str
    model: str | None = None
    options: dict | None = None
    cloud_enabled: bool = False
    byok: ByokProviderConfig | None = None


class ProcessTemplateRequest(BaseModel):
    model_config = _camel

    template: str
    variables: dict[str, str] = {}


class ProcessTemplateResponse(BaseModel):
    model_config = _camel

    rendered: str
    variables: list[str]
