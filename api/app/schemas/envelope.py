from typing import Any

from pydantic import BaseModel


class ApiResponse[T](BaseModel):
    success: bool
    data: T | None = None
    error: str | None = None
    metadata: dict | None = None

    @classmethod
    def ok(cls, data: T, metadata: dict | None = None) -> "ApiResponse[T]":
        return cls(success=True, data=data, metadata=metadata)

    @classmethod
    def fail(cls, error: str) -> "ApiResponse[Any]":
        # An error envelope carries no data, so the concrete payload type is
        # irrelevant here — callers return this from endpoints typed for a
        # specific ApiResponse[T] without a return-type mismatch.
        return cls(success=False, error=error)
