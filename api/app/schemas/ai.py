from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator
from pydantic.alias_generators import to_camel

_camel = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class OllamaStatus(BaseModel):
    model_config = _camel

    reachable: bool
    models: list[str] = []


class AiStatusResponse(BaseModel):
    model_config = _camel

    ollama: OllamaStatus
    provider: Literal["ollama"] | None = None


ByokProviderType = Literal["openai", "anthropic", "openai_compatible"]


class ByokProviderConfig(BaseModel):
    """Per-request bring-your-own-key provider config.

    M3 wire shape (encrypted server-side key storage): the browser sends
    ``provider_id`` referencing a stored ``ai_providers`` row; the backend
    decrypts the key in-process and the plaintext never travels back over the
    wire.

    The legacy ``api_key`` field is retained as a deprecated, test-only escape
    hatch (and for backward compatibility with any in-flight client). Exactly
    one of ``provider_id`` / ``api_key`` must be set. ``type`` / ``base_url``
    / ``model`` are accepted for the legacy direct-key path and ignored when
    ``provider_id`` is set (the stored row is authoritative).
    """

    model_config = _camel

    type: ByokProviderType | None = None
    api_key: str | None = None
    provider_id: str | None = None
    base_url: str | None = None
    model: str | None = None

    @model_validator(mode="after")
    def _require_one_key_source(self) -> "ByokProviderConfig":
        if not self.provider_id and not self.api_key:
            raise ValueError("Either providerId or apiKey must be supplied")
        return self


class GenerateRequest(BaseModel):
    model_config = _camel

    prompt: str
    model: str | None = None
    options: dict | None = None
    byok: ByokProviderConfig | None = None


class ProcessTemplateRequest(BaseModel):
    model_config = _camel

    template: str
    variables: dict[str, str] = {}


class ProcessTemplateResponse(BaseModel):
    model_config = _camel

    rendered: str
    variables: list[str]
