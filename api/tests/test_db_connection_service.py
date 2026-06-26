"""Tests for db_connection_service — connection testing + activation (M3).

Guarantees:
  - test_connection never leaks the URL or password in its error.
  - activate swaps the active connection only on full success (test + migrate);
    any failure leaves the current active connection unchanged (PRD OQ #57).
"""

import pytest

from app.db.engines.base import ConnectionTest

# ── test_connection ──────────────────────────────────────────────────────────


class TestTestConnection:
    def test_sqlite_in_memory_ok(self):
        from app.services.db_connection_service import test_connection

        result = test_connection("sqlite", "sqlite://")
        assert result.ok is True
        assert result.error is None

    def test_sqlite_bad_path_fails(self, tmp_path):
        from app.services.db_connection_service import test_connection

        result = test_connection("sqlite", f"sqlite:///{tmp_path}/no/such/dir/x.db")
        assert result.ok is False
        assert result.error is not None

    def test_password_redacted_on_postgres_failure(self):
        # psycopg is not installed (M2 dep), so a postgres URL fails fast; the
        # password must not appear in the error regardless.
        from app.services.db_connection_service import test_connection

        result = test_connection("postgresql", "postgresql://user:secret@host:5432/db")
        assert result.ok is False
        assert "secret" not in (result.error or "")

    def test_url_and_password_stripped_from_error(self, monkeypatch):
        from app.services import db_connection_service

        url = "postgresql://user:supersecret@host:5432/db"

        def boom(url_, **kwargs):
            raise RuntimeError(f"failed to connect to {url}")

        monkeypatch.setattr(db_connection_service, "create_engine", boom)
        result = db_connection_service.test_connection("postgresql", url)
        assert result.ok is False
        assert "supersecret" not in (result.error or "")
        assert url not in (result.error or "")

    def test_module_not_found_is_friendly(self, monkeypatch):
        from app.services import db_connection_service

        def boom(url_, **kwargs):
            raise ModuleNotFoundError("No module named 'psycopg2'")

        monkeypatch.setattr(db_connection_service, "create_engine", boom)
        result = db_connection_service.test_connection("postgresql", "postgresql://u:p@h:5432/db")
        assert result.ok is False
        assert "psycopg2" not in (result.error or "")
        assert "driver" in (result.error or "").lower() or "installed" in (result.error or "").lower()


# ── activate ─────────────────────────────────────────────────────────────────


@pytest.fixture
def isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(tmp_path / "dbs.json"))
    monkeypatch.delenv("L1BR3_DATABASE_URL", raising=False)
    # Reset the registry singleton so each activate test resolves from the store.
    from app.db.engines.registry import set_active_engine

    set_active_engine(None)
    yield
    set_active_engine(None)


class TestActivate:
    def test_unknown_connection_returns_not_ok(self, isolated_store):
        from app.services.db_connection_service import activate

        result = activate("does-not-exist")
        assert result.ok is False
        assert result.connection is None

    def test_failing_connection_test_does_not_swap(self, isolated_store, monkeypatch):
        from app.db import connection_store
        from app.services import db_connection_service

        cid = connection_store.add_connection(label="T", engine="sqlite", url="sqlite:///bad")
        active_before = connection_store.get_active_id()
        monkeypatch.setattr(
            db_connection_service, "test_connection", lambda e, u: ConnectionTest(ok=False, error="unreachable")
        )
        result = db_connection_service.activate(cid)
        assert result.ok is False
        assert connection_store.get_active_id() == active_before

    def test_migrate_failure_does_not_swap(self, isolated_store, monkeypatch):
        from app.db import connection_store
        from app.services import db_connection_service

        cid = connection_store.add_connection(label="T", engine="sqlite", url="sqlite:///act.db")
        active_before = connection_store.get_active_id()
        monkeypatch.setattr(db_connection_service, "test_connection", lambda e, u: ConnectionTest(ok=True))
        monkeypatch.setattr(
            db_connection_service,
            "_migrate_target",
            lambda u: ConnectionTest(ok=False, error="migration boom"),
        )
        result = db_connection_service.activate(cid)
        assert result.ok is False
        assert connection_store.get_active_id() == active_before

    def test_success_swaps_active_and_reloads_registry(self, isolated_store, monkeypatch, tmp_path):
        from app.db import connection_store
        from app.db.engines.registry import get_active_engine
        from app.services import db_connection_service

        url = f"sqlite:///{tmp_path}/act.db"
        cid = connection_store.add_connection(label="T", engine="sqlite", url=url)
        monkeypatch.setattr(db_connection_service, "test_connection", lambda e, u: ConnectionTest(ok=True))
        monkeypatch.setattr(db_connection_service, "_migrate_target", lambda u: ConnectionTest(ok=True))

        result = db_connection_service.activate(cid)
        assert result.ok is True
        assert result.connection is not None
        assert result.connection.id == cid
        assert connection_store.get_active_id() == cid
        assert get_active_engine().url == url


# ── _migrate_target (real alembic; validates the env.py inject-if-empty change) ─


class TestMigrateTarget:
    def test_runs_alembic_head_against_a_fresh_sqlite(self, tmp_path):
        from sqlalchemy import create_engine, inspect

        from app.services.db_connection_service import _migrate_target

        url = f"sqlite:///{tmp_path}/migrate_target.db"
        result = _migrate_target(url)
        assert result.ok is True
        assert result.error is None

        # The target now has the application schema (proves the URL was honored
        # by migrations/env.py, not overridden by the active engine).
        eng = create_engine(url)
        try:
            assert "prompts" in inspect(eng).get_table_names()
        finally:
            eng.dispose()

    def test_idempotent_on_already_migrated_db(self, tmp_path):
        from app.services.db_connection_service import _migrate_target

        url = f"sqlite:///{tmp_path}/migrate_idem.db"
        first = _migrate_target(url)
        second = _migrate_target(url)
        assert first.ok is True
        assert second.ok is True

    def test_failure_returns_redacted_error(self, monkeypatch):
        from app.services import db_connection_service

        def boom(cfg, rev):
            raise RuntimeError("migration blew up")

        monkeypatch.setattr("alembic.command.upgrade", boom)
        result = db_connection_service._migrate_target("sqlite:///nonexistent_dir/x.db")
        assert result.ok is False
        assert result.error is not None
