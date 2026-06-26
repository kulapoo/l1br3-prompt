"""Pydantic schemas for the Database Manager (Milestone 3).

Mirrors ``app.schemas.provider``: a ``_camel`` config, a Create that accepts the
credential-bearing URL only on write, an Update that makes it optional, and a
Read that **physically omits** the raw ``url``/``password`` — Pydantic will not
serialize fields that are not declared, so even if a caller passes the stored
row through, the secret cannot leak. The Read exposes only a masked URL and a
``has_password`` flag (the ``has_key`` analogue).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy.engine.url import make_url

_camel = ConfigDict(alias_generator=to_camel, populate_by_name=True)

DbEngine = Literal["sqlite", "postgresql"]


def _validate_url(value: str) -> str:
    # Generic message only — never echo the (possibly secret-laden) input back.
    try:
        make_url(value)
    except Exception as exc:
        raise ValueError("Invalid connection URL") from exc
    return value


class DatabaseConnectionCreate(BaseModel):
    """Write shape — the canonical connection value is a SQLAlchemy URL string."""

    model_config = _camel

    label: str
    engine: DbEngine
    url: str

    @field_validator("url")
    @classmethod
    def _url_must_parse(cls, v: str) -> str:
        return _validate_url(v)


class DatabaseConnectionUpdate(BaseModel):
    """Partial update. Engine is immutable — changing engines means a new connection."""

    model_config = _camel

    label: str | None = None
    url: str | None = None

    @field_validator("url")
    @classmethod
    def _url_must_parse_if_present(cls, v: str | None) -> str | None:
        return None if v is None else _validate_url(v)


class DatabaseConnectionRead(BaseModel):
    """Read shape — NEVER includes the raw url or password.

    ``masked_url`` has the password replaced with ``***``; ``has_password`` is
    the only credential signal (the ``has_key`` analogue).
    """

    model_config = _camel

    id: str
    label: str
    engine: str
    has_password: bool
    host: str | None = None
    port: int | None = None
    database: str | None = None
    masked_url: str
    is_active: bool = False
    is_default: bool = False


class ConnectionTestRequest(BaseModel):
    model_config = _camel

    engine: DbEngine
    url: str

    @field_validator("url")
    @classmethod
    def _url_must_parse(cls, v: str) -> str:
        return _validate_url(v)


class ConnectionTestResponse(BaseModel):
    model_config = _camel

    ok: bool
    error: str | None = None
