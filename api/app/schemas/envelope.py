from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: str | None = None
    metadata: dict | None = None

    @classmethod
    def ok(cls, data: T, metadata: dict | None = None) -> "ApiResponse[T]":
        return cls(success=True, data=data, metadata=metadata)

    @classmethod
    def fail(cls, error: str) -> "ApiResponse[None]":
        return cls(success=False, error=error)
