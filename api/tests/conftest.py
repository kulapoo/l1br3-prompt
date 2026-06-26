import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

# Must be set before app modules are imported
os.environ["L1BR3_TESTING"] = "1"
os.environ["L1BR3_DB_PATH"] = "/tmp/l1br3_test.db"
# Keep the registry's store-consult hermetic: point the connection store at a
# path no test populates, so get_active_id() is None unless a test monkeypatches
# this env to its own tmp file.
os.environ["L1BR3_DATABASES_CONFIG"] = "/tmp/l1br3_test_databases_unused.json"
# Deterministic master key for at-rest encryption tests (valid Fernet key).
os.environ.setdefault("L1BR3_MASTER_KEY", "Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA=")

import app.models  # ensure all models are registered with Base  # noqa: F401
from app.db.base import Base
from app.db.engine import get_db
from app.db.engines.postgres import PostgresEngine
from app.db.engines.registry import set_active_engine
from app.db.engines.sqlite import SqliteEngine
from app.main import app

# Postgres integration gate: set L1BR3_PG_TEST_URL to a live PG to opt in. All
# PG-gated tests (test_db_engine_postgres integration block, test_prompt_search_postgres,
# test_search_parity) pytest.skip cleanly when this is unset, so the default gate
# stays SQLite-only and hermetic.
_PG_URL = os.environ.get("L1BR3_PG_TEST_URL")


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


# ── Postgres integration fixtures (Milestone 2) ──────────────────────────────
# Session-scoped engine (one real PG for the whole run) + a function-scoped
# session wrapped in a SAVEPOINT so each test rolls back and nothing pollutes the
# shared DB. Both pytest.skip without L1BR3_PG_TEST_URL, so ``uv run pytest`` with
# no PG configured is a no-op for the entire PG suite.


@pytest.fixture(scope="session")
def pg_engine():
    if not _PG_URL:
        pytest.skip("set L1BR3_PG_TEST_URL to run Postgres integration tests")
    engine = PostgresEngine(_PG_URL)
    set_active_engine(engine)
    # ORM models emit Postgres-compatible DDL; then the tsvector generated column +
    # GIN index are layered on via the same DDL migration 005 runs.
    Base.metadata.create_all(bind=engine.engine)
    with engine.engine.connect() as conn:
        engine.search.init(conn)
        conn.commit()
    try:
        yield engine
    finally:
        with engine.engine.connect() as conn:
            engine.search.drop(conn)
            conn.commit()
        Base.metadata.drop_all(bind=engine.engine)
        set_active_engine(None)


@pytest.fixture(scope="function")
def pg_session(pg_engine):
    # join_transaction_mode="create_savepoint": the session joins the fixture's
    # outer transaction via a SAVEPOINT, so a test's own commit()/flush() releases
    # the savepoint (visible to later statements in the same test) without ever
    # touching the outer transaction. Teardown rolls the outer txn back → zero
    # cross-test pollution, no per-test TRUNCATE.
    connection = pg_engine.engine.connect()
    trans = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    # The search seam resolves via get_active_engine(); pin it to PG for this test
    # so unit tests that called set_active_engine(None) can't shadow it.
    set_active_engine(pg_engine)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        connection.close()
