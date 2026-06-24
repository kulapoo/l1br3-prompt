"""Schema tests for BYOK provider config on GenerateRequest / TransformRequest."""

import pytest
from pydantic import ValidationError

from app.schemas.ai import ByokProviderConfig, GenerateRequest
from app.schemas.transform import TransformRequest


def test_generate_request_accepts_byok_openai():
    req = GenerateRequest.model_validate(
        {
            "prompt": "hi",
            "byok": {"type": "openai", "apiKey": "sk-xxx", "baseUrl": "https://api.openai.com/v1"},
        }
    )
    assert req.byok is not None
    assert req.byok.type == "openai"
    assert req.byok.api_key == "sk-xxx"
    assert req.byok.base_url == "https://api.openai.com/v1"


def test_generate_request_byok_defaults_to_none():
    req = GenerateRequest.model_validate({"prompt": "hi"})
    assert req.byok is None


def test_generate_request_rejects_unknown_byok_type():
    with pytest.raises(ValidationError):
        GenerateRequest.model_validate({"prompt": "hi", "byok": {"type": "grok", "apiKey": "x"}})


def test_generate_request_rejects_byok_without_api_key():
    with pytest.raises(ValidationError):
        GenerateRequest.model_validate({"prompt": "hi", "byok": {"type": "openai"}})


def test_byok_accepts_openai_compatible_and_anthropic_types():
    for t in ("openai", "anthropic", "openai_compatible"):
        cfg = ByokProviderConfig(type=t, api_key="k")  # type: ignore[arg-type]
        assert cfg.type == t


def test_transform_request_accepts_byok_field():
    req = TransformRequest.model_validate({"prompt": "hi", "byok": {"type": "anthropic", "apiKey": "sk-ant"}})
    assert req.byok is not None
    assert req.byok.type == "anthropic"
    assert req.byok.base_url is None
    assert req.byok.model is None
