"""Tests for the PostgreSQL engine + tsvector search backend (Milestone 2).

Mirrors ``test_db_engine.py`` (the SQLite suite) class-for-class so the parity
contract is obvious. Unit tests (SQL construction, protocol conformance, registry
dispatch, ``from_env``) run in the default gate with **no** live Postgres. The
integration tests are collected but ``pytest.skip`` unless ``L1BR3_PG_TEST_URL``
is set (see ``conftest.pg_session``).
"""

import os

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.engines.base import DatabaseEngine, SearchBackend
from app.db.engines.registry import _resolve_engine, get_active_engine, set_active_engine

PG_URL = os.environ.get("L1BR3_PG_TEST_URL")


# ── _PostgresTsVectorSearch: SQL construction (Task 2, unit, no DB) ──────────


class TestPostgresSearchSql:
    """The DDL/query strings are the search contract — assert on their shape so a
    careless edit can't silently break parity (dictionary, weighting, ranking)."""

    def test_search_dictionary_constant_is_simple(self):
        from app.db.engines.postgres import SEARCH_DICTIONARY

        assert SEARCH_DICTIONARY == "simple"

    def test_column_ddl_uses_simple_dictionary(self):
        from app.db.engines.postgres import _TSV_COLUMN_DDL, SEARCH_DICTIONARY

        assert f"to_tsvector('{SEARCH_DICTIONARY}'" in _TSV_COLUMN_DDL

    def test_column_ddl_is_generated_stored(self):
        from app.db.engines.postgres import _TSV_COLUMN_DDL

        assert "GENERATED ALWAYS AS" in _TSV_COLUMN_DDL
        assert "STORED" in _TSV_COLUMN_DDL

    def test_column_ddl_weights_title_above_content(self):
        from app.db.engines.postgres import _TSV_COLUMN_DDL

        assert "setweight(" in _TSV_COLUMN_DDL
        # title is weighted 'A' (highest), content 'B' — parity with FTS5 bm25-ish ranking.
        assert "'A'" in _TSV_COLUMN_DDL
        assert "'B'" in _TSV_COLUMN_DDL

    def test_column_ddl_is_idempotent(self):
        from app.db.engines.postgres import _TSV_COLUMN_DDL

        assert "ADD COLUMN IF NOT EXISTS" in _TSV_COLUMN_DDL

    def test_column_ddl_targets_search_tsv_column(self):
        from app.db.engines.postgres import _TSV_COLUMN_DDL

        assert "search_tsv" in _TSV_COLUMN_DDL

    def test_gin_ddl_uses_gin_index(self):
        from app.db.engines.postgres import _TSV_GIN_DDL

        assert "USING GIN" in _TSV_GIN_DDL
        assert "search_tsv" in _TSV_GIN_DDL

    def test_gin_ddl_is_idempotent(self):
        from app.db.engines.postgres import _TSV_GIN_DDL

        assert "CREATE INDEX IF NOT EXISTS" in _TSV_GIN_DDL

    def test_search_sql_uses_plainto_tsquery(self):
        from app.db.engines.postgres import _SEARCH_SQL

        # plainto_tsquery (not to_tsquery) tolerates unquoted/punctuated user input.
        assert "plainto_tsquery" in _SEARCH_SQL
        assert "to_tsquery(" not in _SEARCH_SQL.replace("plainto_tsquery", "X")

    def test_search_sql_uses_simple_dictionary(self):
        from app.db.engines.postgres import _SEARCH_SQL, SEARCH_DICTIONARY

        assert f"plainto_tsquery('{SEARCH_DICTIONARY}'" in _SEARCH_SQL

    def test_search_sql_uses_match_operator_and_rank_cd(self):
        from app.db.engines.postgres import _SEARCH_SQL

        assert "@@" in _SEARCH_SQL
        assert "ts_rank_cd" in _SEARCH_SQL
        assert "ORDER BY" in _SEARCH_SQL
        assert "DESC" in _SEARCH_SQL

    def test_search_sql_returns_id_only(self):
        from app.db.engines.postgres import _SEARCH_SQL

        assert "SELECT id" in _SEARCH_SQL or "SELECT p.id" in _SEARCH_SQL
        assert ":q" in _SEARCH_SQL

    def test_drop_ddl_drops_index_and_column(self):
        from app.db.engines.postgres import _DROP_DDL

        assert "DROP INDEX IF EXISTS" in _DROP_DDL
        assert "DROP COLUMN IF EXISTS" in _DROP_DDL
        assert "search_tsv" in _DROP_DDL

    def test_search_backend_satisfies_protocol(self):
        from app.db.engines.postgres import _PostgresTsVectorSearch

        assert isinstance(_PostgresTsVectorSearch(), SearchBackend)


# ── PostgresEngine concrete impl (Task 3, unit) ──────────────────────────────


class TestPostgresEngine:
    def test_engine_satisfies_database_engine_protocol(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        assert isinstance(eng, DatabaseEngine)

    def test_search_is_tsvector_backend(self):
        from app.db.engines.postgres import PostgresEngine, _PostgresTsVectorSearch

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        assert isinstance(eng.search, _PostgresTsVectorSearch)

    def test_url_is_stored(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql+psycopg://x:y@localhost/z")
        assert eng.url == "postgresql+psycopg://x:y@localhost/z"

    def test_dialect_is_postgresql(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        assert eng.dialect == "postgresql"

    def test_init_schema_is_noop(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        # Schema is Alembic's job; the hook must be an inert no-op that ignores
        # its argument — exercised with a dummy so no real connection is opened.
        assert eng.init_schema(object()) is None

    def test_exposes_sqlalchemy_engine(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        assert isinstance(eng.engine, Engine)

    def test_sessionlocal_binds_to_engine(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        assert isinstance(eng.SessionLocal, sessionmaker)

    def test_get_db_yields_then_closes(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        gen = eng.get_db()
        db = next(gen)
        assert isinstance(db, Session)
        # SessionLocal is lazy — building/closing a session never opens a socket,
        # so this fully exercises the generator without needing a live PG.
        with pytest.raises(StopIteration):
            next(gen)

    def test_normalizes_bare_postgresql_url_to_psycopg_driver(self):
        from app.db.engines.postgres import PostgresEngine

        eng = PostgresEngine("postgresql://x:y@localhost/z")
        # SQLAlchemy's bare postgresql:// defaults to psycopg2 (absent). The engine
        # rewrites to the installed psycopg v3 driver so create_engine/migrations work
        # without a second dependency.
        assert eng.url.startswith("postgresql+psycopg://")
        assert eng.engine.dialect.driver == "psycopg"

    def test_from_env_uses_database_url(self, monkeypatch):
        from app.db.engines.postgres import PostgresEngine

        monkeypatch.setenv("L1BR3_DATABASE_URL", "postgresql://u:p@h:5432/db")
        eng = PostgresEngine.from_env()
        assert isinstance(eng, PostgresEngine)
        assert eng.url.startswith("postgresql+psycopg://")

    def test_from_env_raises_when_missing(self, monkeypatch):
        from app.db.engines.postgres import PostgresEngine

        monkeypatch.delenv("L1BR3_DATABASE_URL", raising=False)
        with pytest.raises(ValueError, match="L1BR3_DATABASE_URL"):
            PostgresEngine.from_env()

    def test_from_env_raises_when_not_postgres(self, monkeypatch):
        from app.db.engines.postgres import PostgresEngine

        monkeypatch.setenv("L1BR3_DATABASE_URL", "sqlite:///x.db")
        with pytest.raises(ValueError, match="(?i)postgres"):
            PostgresEngine.from_env()


# ── Registry dialect dispatch (Task 4, unit) ─────────────────────────────────


class TestRegistryDispatch:
    @staticmethod
    def _reset():
        set_active_engine(None)

    def test_postgres_url_via_env_returns_postgres_engine(self, monkeypatch, tmp_path):
        from app.db.engines.postgres import PostgresEngine

        monkeypatch.setenv("L1BR3_DATABASE_URL", "postgresql://u:p@localhost:5432/db")
        monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(tmp_path / "absent.json"))
        self._reset()
        eng = _resolve_engine()
        assert isinstance(eng, PostgresEngine)
        set_active_engine(None)

    def test_postgres_plus_driver_url_returns_postgres_engine(self, monkeypatch, tmp_path):
        from app.db.engines.postgres import PostgresEngine

        monkeypatch.setenv("L1BR3_DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/db")
        monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(tmp_path / "absent.json"))
        self._reset()
        assert isinstance(_resolve_engine(), PostgresEngine)
        set_active_engine(None)

    def test_sqlite_url_via_env_returns_sqlite_engine(self, monkeypatch, tmp_path):
        from app.db.engines.sqlite import SqliteEngine

        monkeypatch.setenv("L1BR3_DATABASE_URL", f"sqlite:///{tmp_path}/env.db")
        monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(tmp_path / "absent.json"))
        self._reset()
        assert isinstance(_resolve_engine(), SqliteEngine)
        set_active_engine(None)

    def test_no_env_falls_back_to_zero_config_sqlite(self, monkeypatch, tmp_path):
        from app.db.engines.sqlite import SqliteEngine

        monkeypatch.delenv("L1BR3_DATABASE_URL", raising=False)
        monkeypatch.setenv("L1BR3_DB_PATH", str(tmp_path / "default.db"))
        monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(tmp_path / "absent.json"))
        self._reset()
        assert isinstance(_resolve_engine(), SqliteEngine)
        set_active_engine(None)

    def test_store_active_postgres_returns_postgres_engine(self, monkeypatch, tmp_path):
        from app.db import connection_store
        from app.db.engines.postgres import PostgresEngine

        monkeypatch.delenv("L1BR3_DATABASE_URL", raising=False)
        monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(tmp_path / "dbs.json"))
        cid = connection_store.add_connection(label="PG", engine="postgresql", url="postgresql://u:p@localhost:5432/db")
        assert connection_store.set_active(cid)
        self._reset()
        assert isinstance(_resolve_engine(), PostgresEngine)
        set_active_engine(None)

    def test_get_active_engine_caches_postgres_singleton(self, monkeypatch, tmp_path):
        from app.db.engines.postgres import PostgresEngine

        monkeypatch.setenv("L1BR3_DATABASE_URL", "postgresql://u:p@localhost:5432/db")
        monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(tmp_path / "absent.json"))
        self._reset()
        a = get_active_engine()
        b = get_active_engine()
        assert a is b
        assert isinstance(a, PostgresEngine)
        set_active_engine(None)


# ── Integration: live Postgres (Task 2/3 sanity) ─────────────────────────────


@pytest.mark.skipif(not PG_URL, reason="set L1BR3_PG_TEST_URL to run Postgres integration tests")
class TestPostgresEngineIntegration:
    """Smoke against a real PG: schema boot, search index init/search/drop."""

    def test_init_creates_search_tsv_column_and_gin_index(self, pg_engine):
        from sqlalchemy import text

        with pg_engine.engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='prompts' AND column_name='search_tsv'"
                )
            ).fetchone()
            assert row is not None
            idx = conn.execute(
                text(
                    "SELECT indexname FROM pg_indexes WHERE tablename='prompts' AND indexname='idx_prompts_search_tsv'"
                )
            ).fetchone()
            assert idx is not None

    def test_drop_removes_search_index(self, pg_engine):
        from sqlalchemy import text

        with pg_engine.engine.connect() as conn:
            pg_engine.search.drop(conn)
            conn.commit()
            idx = conn.execute(
                text(
                    "SELECT indexname FROM pg_indexes WHERE tablename='prompts' AND indexname='idx_prompts_search_tsv'"
                )
            ).fetchone()
            assert idx is None
            # restore for subsequent tests
            pg_engine.search.init(conn)
            conn.commit()

    def test_search_prompts_returns_ids(self, pg_engine, pg_session):
        from sqlalchemy import text

        pg_session.execute(
            text(
                "INSERT INTO prompts (id, title, content, category, usage_count, is_favorite, created_at, updated_at) "
                "VALUES ('pg1', 'Python debugging', 'Use pdb here', 'Code', 0, false, now(), now())"
            )
        )
        pg_session.execute(
            text(
                "INSERT INTO prompts (id, title, content, category, usage_count, is_favorite, created_at, updated_at) "
                "VALUES ('pg2', 'Email draft', 'Dear customer', 'Writing', 0, false, now(), now())"
            )
        )
        pg_session.flush()
        ids = pg_engine.search.search_prompts(pg_session, "python")
        assert "pg1" in ids
        assert "pg2" not in ids
