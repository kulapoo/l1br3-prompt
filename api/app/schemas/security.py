"""Pydantic v2 schemas for the F19 master-key portability endpoints."""

from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_camel = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MasterKeyStatus(BaseModel):
    """Status of the on-disk master key + whether the env override is active."""

    model_config = _camel

    present: bool
    env_override: bool


class ExportRequest(BaseModel):
    model_config = _camel

    passphrase: str


class ExportResponse(BaseModel):
    """The exported bundle plus an optional warning (e.g. env override active)."""

    model_config = _camel

    bundle: dict[str, Any]
    warning: str | None = None


class ImportRequest(BaseModel):
    model_config = _camel

    passphrase: str
    bundle: dict[str, Any]


class ImportResult(BaseModel):
    """Result of a successful import — surfaces whether the file was overwritten."""

    model_config = _camel

    imported: bool
    previous_key_present: bool
