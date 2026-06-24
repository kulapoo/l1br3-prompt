import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

# Must be set before app modules are imported
os.environ["L1BR3_TESTING"] = "1"
os.environ["L1BR3_DB_PATH"] = "/tmp/l1br3_test.db"

import app.models  # ensure all models are registered with Base  # noqa: F401
from app.db.base import Base
from app.db.engine import get_db
from app.db.engines.registry import set_active_engine
from app.db.engines.sqlite import SqliteEngine
from app.main import app


@pytest.fixture(scope="function")
def db() -> Session:
    # In-memory SQLite with StaticPool so all connections share one DB; matches
    # the pre-refactor behavior but now expressed through the engine abstraction.
    engine = SqliteEngine("sqlite:///:memory:", poolclass=StaticPool)
    set_active_engine(engine)
    Base.metadata.create_all(bind=engine.engine)
    with engine.engine.connect() as conn:
        engine.search.init(conn)
        conn.commit()
    session = engine.SessionLocal()
    try:
        yield session
    finally:
        session.close()
        with engine.engine.connect() as conn:
            engine.search.drop(conn)
            conn.commit()
        Base.metadata.drop_all(bind=engine.engine)
        set_active_engine(None)


@pytest.fixture(scope="function")
def client(db: Session) -> TestClient:
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()
