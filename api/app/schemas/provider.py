from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_camel = ConfigDict(alias_generator=to_camel, populate_by_name=True)

ProviderType = Literal["openai", "anthropic", "openai_compatible"]


class ProviderCreate(BaseModel):
    """Write shape — accepts the plaintext key ONLY on create."""

    model_config = _camel

    type: ProviderType
    base_url: str | None = None
    api_key: str


class ProviderUpdate(BaseModel):
    """Partial update. Key is optional; omit to leave it unchanged."""

    model_config = _camel

    base_url: str | None = None
    api_key: str | None = None


class ProviderRead(BaseModel):
    """Read shape — NEVER includes the key. ``has_key`` is the only key signal.

    Physically omitting ``api_key``/``encrypted_api_key`` here is the load-bearing
    security control: Pydantic will not serialize fields that are not declared,
    so even if the route accidentally passes the ORM row through, the secret
    cannot leak.
    """

    model_config = _camel

    id: str
    type: ProviderType
    base_url: str | None = None
    has_key: bool
