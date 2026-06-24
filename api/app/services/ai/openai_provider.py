import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.services.ai.provider import ProviderError, ProviderStatus

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.openai.com/v1"


class OpenAIProvider:
    """OpenAI Chat Completions provider. Also covers OpenAI-compatible endpoints
    (LM Studio, vLLM, OpenRouter) via a custom ``base_url``.

    Milestone 1 bridge: the api_key is supplied per-request by the browser. Milestone 3
    will replace this with encrypted server-side storage bound to 127.0.0.1.
    """

    def __init__(
        self,
        http: httpx.AsyncClient,
        api_key: str,
        base_url: str | None = None,
    ) -> None:
        self._http = http
        self._api_key = api_key
        self._base = (base_url or DEFAULT_BASE_URL).rstrip("/")

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    async def health(self) -> ProviderStatus:
        try:
            r = await self._http.get(f"{self._base}/models", headers=self._headers(), timeout=5.0)
            r.raise_for_status()
            data = r.json()
            models = [m["id"] for m in data.get("data", []) if m.get("id")]
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
        payload = self._payload(prompt, model=model, stream=False, options=options)
        try:
            r = await self._http.post(
                f"{self._base}/chat/completions",
                json=payload,
                headers=self._headers(),
                timeout=60.0,
            )
            self._raise_for_status(r)
            choices = r.json().get("choices", [])
            if not choices:
                return ""
            return choices[0].get("message", {}).get("content", "")
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise ProviderError(f"openai error: {exc}") from exc

    def stream(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ) -> AsyncIterator[str]:
        return self._stream_impl(prompt, model=model, options=options)

    async def _stream_impl(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ) -> AsyncIterator[str]:
        payload = self._payload(prompt, model=model, stream=True, options=options)
        try:
            async with self._http.stream(
                "POST",
                f"{self._base}/chat/completions",
                json=payload,
                headers=self._headers(),
                timeout=120.0,
            ) as r:
                self._raise_for_status(r)
                async for line in r.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if not raw or raw == "[DONE]":
                        if raw == "[DONE]":
                            return
                        continue
                    try:
                        frame = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    choices = frame.get("choices") or []
                    if not choices:
                        continue
                    content = choices[0].get("delta", {}).get("content")
                    if isinstance(content, str) and content:
                        yield content
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise ProviderError(f"openai stream error: {exc}") from exc

    def _payload(
        self,
        prompt: str,
        *,
        model: str,
        stream: bool,
        options: dict | None,
    ) -> dict:
        payload: dict = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": stream,
        }
        if options:
            payload.update(options)
        return payload

    def _raise_for_status(self, r: httpx.Response) -> None:
        if r.status_code == 401:
            raise ProviderError("auth_error: invalid API key")
        if r.status_code == 429:
            raise ProviderError("rate_limited: provider returned 429")
        if r.status_code == 404:
            raise ProviderError("model_not_found: provider returned 404")
        if r.status_code >= 400:
            raise ProviderError(f"openai error: {r.status_code}")
