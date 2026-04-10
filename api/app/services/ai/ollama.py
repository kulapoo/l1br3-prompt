import json
import logging
import os
from typing import AsyncIterator

import httpx

from app.services.ai.provider import ProviderError, ProviderStatus

logger = logging.getLogger(__name__)

_DEFAULT_URL = "http://127.0.0.1:11434"


class OllamaProvider:
    """Talks to a local Ollama instance over HTTP."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http
        self._base = os.environ.get("L1BR3_OLLAMA_URL", _DEFAULT_URL).rstrip("/")

    async def health(self) -> ProviderStatus:
        """Return reachability and available model names."""
        try:
            r = await self._http.get(f"{self._base}/api/tags", timeout=2.0)
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
            return ProviderStatus(reachable=True, models=models)
        except Exception:
            return ProviderStatus(reachable=False, models=[])

    async def generate(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ) -> str:
        """Generate a complete response (non-streaming)."""
        payload: dict = {"model": model, "prompt": prompt, "stream": False}
        if options:
            payload["options"] = options
        try:
            r = await self._http.post(
                f"{self._base}/api/generate",
                json=payload,
                timeout=60.0,
            )
            r.raise_for_status()
            return r.json().get("response", "")
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama error: {exc}") from exc

    def stream(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ) -> AsyncIterator[str]:
        """Return an async iterator that yields text chunks as they arrive."""
        return self._stream_impl(prompt, model=model, options=options)

    async def _stream_impl(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ):
        payload: dict = {"model": model, "prompt": prompt, "stream": True}
        if options:
            payload["options"] = options
        try:
            async with self._http.stream(
                "POST",
                f"{self._base}/api/generate",
                json=payload,
                timeout=120.0,
            ) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    if data.get("response"):
                        yield data["response"]
                    if data.get("done"):
                        return
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama stream error: {exc}") from exc
