import json
import logging
from collections.abc import AsyncIterator

import httpx

from app.services.ai.provider import ProviderError, ProviderStatus

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://api.anthropic.com/v1"
ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_MAX_TOKENS = 4096


class AnthropicProvider:
    """Anthropic Messages API provider.

    Streams via Anthropic's SSE event format:
      - ``content_block_delta`` (yields ``delta.text``)
      - ``message_stop`` (ends the stream)
    All other event types (ping, message_start, content_block_start, ...) are ignored.

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
        return {
            "x-api-key": self._api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

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
                f"{self._base}/messages",
                json=payload,
                headers=self._headers(),
                timeout=60.0,
            )
            self._raise_for_status(r)
            content = r.json().get("content", [])
            return "".join(
                block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text"
            )
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise ProviderError(f"anthropic error: {exc}") from exc

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
                f"{self._base}/messages",
                json=payload,
                headers=self._headers(),
                timeout=120.0,
            ) as r:
                self._raise_for_status(r)
                current_event = ""
                async for line in r.aiter_lines():
                    if not line:
                        current_event = ""
                        continue
                    if line.startswith("event: "):
                        current_event = line[7:].strip()
                        continue
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if not raw:
                        continue
                    try:
                        frame = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if current_event == "message_stop":
                        return
                    if current_event == "content_block_delta":
                        text = frame.get("delta", {}).get("text")
                        if isinstance(text, str) and text:
                            yield text
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise ProviderError(f"anthropic stream error: {exc}") from exc

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
            "max_tokens": DEFAULT_MAX_TOKENS,
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
            raise ProviderError(f"anthropic error: {r.status_code}")
