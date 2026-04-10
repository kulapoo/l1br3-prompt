import json
import logging
import os
from dataclasses import dataclass
from typing import AsyncIterator

import httpx

from app.services.ai.provider import ProviderError, ProviderStatus

logger = logging.getLogger(__name__)

# Public default — overridable via L1BR3_CLOUD_AI_URL env var.
DEFAULT_WORKER_URL = "https://cloud-ai.l1br3-prompt.workers.dev"


@dataclass
class CloudQuota:
    used: int
    remaining: int
    total: int
    reset_at: str | None


class CloudFallbackProvider:
    """Forwards AI requests to the l1br3 Cloudflare Worker proxy."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        device_id: str,
        base_url: str | None = None,
    ) -> None:
        self._http = http
        self._device_id = device_id
        self._base = (
            base_url
            or os.environ.get("L1BR3_CLOUD_AI_URL", DEFAULT_WORKER_URL)
        ).rstrip("/")
        self.last_quota: CloudQuota | None = None

    def _headers(self) -> dict[str, str]:
        return {"X-Device-Id": self._device_id}

    async def health(self) -> ProviderStatus:
        """Check worker availability and populate last_quota."""
        try:
            r = await self._http.get(
                f"{self._base}/v1/health",
                params={"device": self._device_id},
                timeout=5.0,
            )
            r.raise_for_status()
            data = r.json()
            quota_raw = data.get("quota", {})
            self.last_quota = CloudQuota(
                used=quota_raw.get("used", 0),
                remaining=quota_raw.get("remaining", 0),
                total=quota_raw.get("total", 50),
                reset_at=quota_raw.get("resetAt"),
            )
            return ProviderStatus(reachable=True, models=["cloud-default"])
        except Exception:
            return ProviderStatus(reachable=False, models=[])

    async def generate(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ) -> str:
        """Generate a complete response (non-streaming) via the worker."""
        payload: dict = {"prompt": prompt, "model": model, "stream": False}
        if options:
            payload["options"] = options
        try:
            r = await self._http.post(
                f"{self._base}/v1/generate",
                json=payload,
                headers=self._headers(),
                timeout=60.0,
            )
            if r.status_code == 429:
                data = r.json()
                raise ProviderError(f"quota_exceeded: resets at {data.get('resetAt', 'unknown')}")
            r.raise_for_status()

            # Worker returns SSE even for non-streaming; collect all chunks.
            text = ""
            for line in r.text.splitlines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if not raw:
                    continue
                try:
                    frame = json.loads(raw)
                    if chunk := frame.get("chunk"):
                        text += chunk
                    if frame.get("error"):
                        raise ProviderError(f"Worker error: {frame['error']}")
                except json.JSONDecodeError:
                    continue
            return text
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise ProviderError(f"Cloud provider error: {exc}") from exc

    def stream(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ) -> AsyncIterator[str]:
        """Stream text chunks from the worker via SSE."""
        return self._stream_impl(prompt, model=model, options=options)

    async def _stream_impl(
        self,
        prompt: str,
        *,
        model: str,
        options: dict | None = None,
    ):
        payload: dict = {"prompt": prompt, "model": model, "stream": True}
        if options:
            payload["options"] = options
        try:
            async with self._http.stream(
                "POST",
                f"{self._base}/v1/generate",
                json=payload,
                headers=self._headers(),
                timeout=120.0,
            ) as r:
                if r.status_code == 429:
                    raw = await r.aread()
                    data = json.loads(raw)
                    raise ProviderError(f"quota_exceeded: resets at {data.get('resetAt', 'unknown')}")
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if not raw:
                        continue
                    try:
                        frame = json.loads(raw)
                        if chunk := frame.get("chunk"):
                            yield chunk
                        if frame.get("done"):
                            return
                        if frame.get("error"):
                            raise ProviderError(f"Worker error: {frame['error']}")
                    except json.JSONDecodeError:
                        continue
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise ProviderError(f"Cloud stream error: {exc}") from exc
