"""Tests for the pluggable database engine abstraction (Milestone 1).

Covers: Protocols (base.py), SqliteEngine concrete impl, registry/active-engine
accessor, and config precedence (L1BR3_DATABASE_URL > L1BR3_DB_PATH > default).
"""

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.db.engines.base import ConnectionTest, DatabaseEngine, SearchBackend
from app.db.engines.registry import get_active_engine, set_active_engine
from app.db.engines.sqlite import SqliteEngine


def _create_prompt_tables(sa_engine: Engine) -> None:
    """Build the ORM schema the FTS triggers reference."""
    import app.models  # noqa: F401
    from app.db.base import Base

    Base.metadata.create_all(bind=sa_engine)


# ── Protocols (Task 1) ───────────────────────────────────────────────────────


class TestProtocols:
    def test_database_engine_is_runtime_checkable(self):
        assert isinstance(SqliteEngine(url="sqlite://"), DatabaseEngine)

    def test_search_backend_is_runtime_checkable(self):
        eng = SqliteEngine(url="sqlite://")
        assert isinstance(eng.search, SearchBackend)

    def test_connection_test_dataclass_fields(self):
        ct = ConnectionTest(ok=True, error=None)
        assert ct.ok is True
        assert ct.error is None

    def test_connection_test_frozen(self):
        ct = ConnectionTest(ok=False, error="boom")
        with pytest.raises(Exception):
            ct.ok = True  # type: ignore[misc]


# ── SqliteEngine (Task 2) ────────────────────────────────────────────────────


class TestSqliteEngine:
    def test_url_is_stored(self):
        eng = SqliteEngine(url="sqlite:///x.db")
        assert eng.url == "sqlite:///x.db"

    def test_dialect_is_sqlite(self):
        eng = SqliteEngine(url="sqlite://")
        assert eng.dialect == "sqlite"

    def test_exposes_sqlalchemy_engine(self):
        eng = SqliteEngine(url="sqlite://")
        assert isinstance(eng.engine, Engine)

    def test_sessionlocal_binds_to_engine(self):
        eng = SqliteEngine(url="sqlite://")
        assert isinstance(eng.SessionLocal, sessionmaker)

    def test_get_db_yields_then_closes(self):
        eng = SqliteEngine(url="sqlite://")
        gen = eng.get_db()
        db = next(gen)
        assert isinstance(db, Session)
        with pytest.raises(StopIteration):
            next(gen)

    def test_from_env_uses_database_url_over_db_path(self, monkeypatch, tmp_path):
        url = f"sqlite:///{tmp_path}/url.db"
        monkeypatch.setenv("L1BR3_DATABASE_URL", url)
        monkeypatch.setenv("L1BR3_DB_PATH", str(tmp_path / "path.db"))
        eng = SqliteEngine.from_env()
        assert eng.url == url

    def test_from_env_uses_db_path_when_no_url(self, monkeypatch, tmp_path):
        monkeypatch.delenv("L1BR3_DATABASE_URL", raising=False)
        path = tmp_path / "frompath.db"
        monkeypatch.setenv("L1BR3_DB_PATH", str(path))
        eng = SqliteEngine.from_env()
        assert eng.url == f"sqlite:///{path}"

    def test_from_env_defaults_when_no_env(self, monkeypatch):
        monkeypatch.delenv("L1BR3_DATABASE_URL", raising=False)
        monkeypatch.delenv("L1BR3_DB_PATH", raising=False)
        eng = SqliteEngine.from_env()
        assert eng.url.startswith("sqlite:///")
        assert ".l1br3" in eng.url

    def test_search_init_creates_fts_table(self):
        eng = SqliteEngine(url="sqlite://")
        _create_prompt_tables(eng.engine)
        with eng.engine.connect() as conn:
            eng.search.init(conn)
            conn.commit()
            row = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts_fts'")
            ).fetchone()
            assert row is not None
            triggers = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'prompts_%'")
            ).fetchall()
            names = {r[0] for r in triggers}
            assert {"prompts_ai", "prompts_ad", "prompts_au"} <= names

    def test_search_drop_removes_fts_table(self):
        eng = SqliteEngine(url="sqlite://")
        _create_prompt_tables(eng.engine)
        with eng.engine.connect() as conn:
            eng.search.init(conn)
            conn.commit()
            eng.search.drop(conn)
            conn.commit()
            row = conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts_fts'")
            ).fetchone()
            assert row is None

    def test_search_search_prompts_returns_ids(self):
        eng = SqliteEngine(url="sqlite://")
        _create_prompt_tables(eng.engine)
        with eng.engine.connect() as conn:
            eng.search.init(conn)
            conn.commit()
        session = eng.SessionLocal()
        try:
            session.execute(
                text(
                    "INSERT INTO prompts (id, title, content, category, usage_count, is_favorite, created_at, updated_at) "
                    "VALUES ('p1', 'Python debugging', 'Use pdb', 'Code', 0, 0, '2024-01-01', '2024-01-01')"
                )
            )
            session.execute(
                text(
                    "INSERT INTO prompts (id, title, content, category, usage_count, is_favorite, created_at, updated_at) "
                    "VALUES ('p2', 'Email', 'Dear customer', 'Writing', 0, 0, '2024-01-01', '2024-01-01')"
                )
            )
            session.commit()
            ids = eng.search.search_prompts(session, "python")
            assert ids == ["p1"]
        finally:
            session.close()


# ── Registry / active engine (Task 3) ────────────────────────────────────────


class TestRegistry:
    def test_get_active_engine_returns_singleton(self):
        set_active_engine(None)
        a = get_active_engine()
        b = get_active_engine()
        assert a is b

    def test_set_active_engine_overrides(self):
        custom = SqliteEngine(url="sqlite:///override.db")
        set_active_engine(custom)
        assert get_active_engine() is custom
        set_active_engine(None)

    def test_active_engine_satisfies_protocol(self):
        set_active_engine(None)
        assert isinstance(get_active_engine(), DatabaseEngine)


# ── engine.py shim re-exports (Task 3) ───────────────────────────────────────


class TestShimReExports:
    def test_engine_module_re_exports_legacy_names(self):
        from app.db import engine as engine_mod

        assert engine_mod.DATABASE_URL is not None
        assert engine_mod.engine is not None
        assert callable(engine_mod.SessionLocal)
        assert callable(engine_mod.get_db)
        assert callable(engine_mod.get_active_engine)
        assert callable(engine_mod.set_active_engine)
