import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# Must be set before app modules are imported
os.environ["L1BR3_TESTING"] = "1"
os.environ["L1BR3_DB_PATH"] = "/tmp/l1br3_test.db"

from app.db.base import Base
from app.db.engine import get_db
from app.main import app

# Use StaticPool so all connections share the same in-memory database
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def _create_fts_and_triggers(conn):
    conn.execute(text("""
        CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
            title,
            content,
            content='prompts',
            content_rowid='rowid'
        )
    """))
    conn.execute(text("""
        CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
            INSERT INTO prompts_fts(rowid, title, content)
            VALUES (new.rowid, new.title, new.content);
        END
    """))
    conn.execute(text("""
        CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
            INSERT INTO prompts_fts(prompts_fts, rowid, title, content)
            VALUES ('delete', old.rowid, old.title, old.content);
        END
    """))
    conn.execute(text("""
        CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
            INSERT INTO prompts_fts(prompts_fts, rowid, title, content)
            VALUES ('delete', old.rowid, old.title, old.content);
            INSERT INTO prompts_fts(rowid, title, content)
            VALUES (new.rowid, new.title, new.content);
        END
    """))


@pytest.fixture(scope="function")
def db() -> Session:
    import app.models  # ensure all models are registered with Base  # noqa: F401
    Base.metadata.create_all(bind=test_engine)
    with test_engine.connect() as conn:
        _create_fts_and_triggers(conn)
        conn.commit()
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        with test_engine.connect() as conn:
            conn.execute(text("DROP TABLE IF EXISTS prompts_fts"))
            conn.commit()
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db: Session) -> TestClient:
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()
