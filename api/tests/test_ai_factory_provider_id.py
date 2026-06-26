"""Unit tests for the provider_id resolution branch of resolve_provider (M3)."""

import httpx
import pytest
from pytest_httpx import HTTPXMock
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.engines.registry import set_active_engine
from app.db.engines.sqlite import SqliteEngine
from app.schemas.ai import ByokProviderConfig
from app.services.ai.factory import resolve_provider
from app.services.ai.openai_provider import OpenAIProvider
from app.services.provider_service import ProviderService

pytestmark = pytest.mark.asyncio

OPENAI_MODELS_URL = "https://api.openai.com/v1/models"


class _FakeRequest:
    def __init__(self, client: httpx.AsyncClient) -> None:
        class _State:
            http = client

        self.app = type("App", (), {"state": _State()})()
        self.headers: dict[str, str] = {}


@pytest.fixture()
def db_session() -> Session:
    from sqlalchemy.pool import StaticPool

    engine = SqliteEngine("sqlite:///:memory:", poolclass=StaticPool)
    set_active_engine(engine)
    Base.metadata.create_all(bind=engine.engine)
    session = engine.SessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine.engine)
    set_active_engine(None)


async def test_provider_id_resolves_stored_key(httpx_mock: HTTPXMock, db_session: Session):
    httpx_mock.add_response(url=OPENAI_MODELS_URL, json={"data": [{"id": "gpt-4o"}]})
    stored = ProviderService(db_session).create(type_="openai", base_url=None, api_key="sk-stored-secret")
    db_session.commit()

    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        byok = ByokProviderConfig(provider_id=stored.id)
        provider, label, status = await resolve_provider(req, byok=byok, db=db_session)

    assert isinstance(provider, OpenAIProvider)
    assert label == "byok:openai"
    assert status.reachable is True
    sent_auth = httpx_mock.get_requests()[0].headers.get("authorization", "")
    assert sent_auth == "Bearer sk-stored-secret"


async def test_provider_id_missing_raises(httpx_mock: HTTPXMock, db_session: Session):
    from app.services.ai.provider import ProviderError

    async with httpx.AsyncClient() as client:
        req = _FakeRequest(client)
        byok = ByokProviderConfig(provider_id="no-such-id")
        with pytest.raises(ProviderError, match="No provider with id"):
            await resolve_provider(req, byok=byok, db=db_session)
