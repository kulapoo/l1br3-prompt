from dataclasses import dataclass, field
from typing import AsyncIterator, Protocol, runtime_checkable


@dataclass
class ProviderStatus:
    reachable: bool
    models: list[str] = field(default_factory=list)


class ProviderError(Exception):
    """Raised when the AI provider is unreachable or returns an error."""


@runtime_checkable
class AIProvider(Protocol):
    async def health(self) -> ProviderStatus: ...
    async def generate(self, prompt: str, *, model: str, options: dict | None = None) -> str: ...
    def stream(self, prompt: str, *, model: str, options: dict | None = None) -> AsyncIterator[str]: ...
