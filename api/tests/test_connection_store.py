"""Tests for the file-backed database connection store (Milestone 3).

The store persists user-configured DB connections + the active selection to
``~/.l1br3/databases.json`` (0600), read before any DB connection is made so the
"set-active" selection survives restarts. It is deliberately file-backed (not a
DB table) to avoid the chicken-and-egg of storing a connection inside the DB it
describes.
"""

import json
import stat

from app.db import connection_store
from app.db.connection_store import StoredConnection


def _set_path(monkeypatch, tmp_path):
    p = tmp_path / "databases.json"
    monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(p))
    return p


# ── Seeding / zero-config ────────────────────────────────────────────────────


class TestSeed:
    def test_list_returns_default_when_file_missing(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        cs = connection_store.list_connections()
        assert len(cs) == 1
        assert cs[0].engine == "sqlite"
        assert cs[0].is_default is True
        assert cs[0].url.startswith("sqlite:///")

    def test_active_id_none_when_file_missing(self, monkeypatch, tmp_path):
        # The registry relies on None here to fall through to env/default.
        _set_path(monkeypatch, tmp_path)
        assert connection_store.get_active_id() is None

    def test_default_id_is_stable(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        cs = connection_store.list_connections()
        assert cs[0].id == connection_store.DEFAULT_CONNECTION_ID

    def test_default_url_matches_engine_default(self, monkeypatch, tmp_path):
        from app.db.engines.sqlite import DEFAULT_DB_PATH

        _set_path(monkeypatch, tmp_path)
        cs = connection_store.list_connections()
        assert cs[0].url == f"sqlite:///{DEFAULT_DB_PATH}"


# ── CRUD ─────────────────────────────────────────────────────────────────────


class TestCRUD:
    def test_add_persists_and_returns_id(self, monkeypatch, tmp_path):
        p = _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="PG", engine="postgresql", url="postgresql://u:p@h:5432/db")
        assert cid != connection_store.DEFAULT_CONNECTION_ID
        assert p.exists()
        cs = connection_store.list_connections()
        assert any(c.id == cid and c.label == "PG" for c in cs)

    def test_get_connection_found_and_unknown(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        assert connection_store.get_connection(cid) is not None
        assert connection_store.get_connection("nope") is None

    def test_get_connection_returns_default(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        got = connection_store.get_connection(connection_store.DEFAULT_CONNECTION_ID)
        assert got is not None
        assert got.is_default is True

    def test_update_connection_label_and_url(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        updated = connection_store.update_connection(cid, label="Y", url="sqlite:///y.db")
        assert updated is not None
        assert updated.label == "Y"
        assert updated.url == "sqlite:///y.db"

    def test_update_unknown_returns_none(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        assert connection_store.update_connection("nope", label="Y") is None

    def test_delete_removes(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        assert connection_store.delete_connection(cid) is True
        assert connection_store.get_connection(cid) is None

    def test_delete_refuses_default(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        assert connection_store.delete_connection(connection_store.DEFAULT_CONNECTION_ID) is False

    def test_delete_refuses_active(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        assert connection_store.set_active(cid) is True
        assert connection_store.delete_connection(cid) is False


# ── Active selection ─────────────────────────────────────────────────────────


class TestActive:
    def test_set_active_persists(self, monkeypatch, tmp_path):
        p = _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        assert connection_store.set_active(cid) is True
        assert connection_store.get_active_id() == cid
        data = json.loads(p.read_text())
        assert data["active_id"] == cid

    def test_set_active_unknown_returns_false(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        assert connection_store.set_active("nope") is False

    def test_active_defaults_to_default_after_first_persist(self, monkeypatch, tmp_path):
        # add_connection triggers the first persist; active must remain the default,
        # NOT the just-added connection.
        _set_path(monkeypatch, tmp_path)
        connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        assert connection_store.get_active_id() == connection_store.DEFAULT_CONNECTION_ID


# ── Persistence guarantees ───────────────────────────────────────────────────


class TestPersistence:
    def test_file_is_0600(self, monkeypatch, tmp_path):
        p = _set_path(monkeypatch, tmp_path)
        connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        mode = stat.S_IMODE(p.stat().st_mode)
        assert mode == 0o600

    def test_malformed_file_falls_back_to_default(self, monkeypatch, tmp_path):
        p = _set_path(monkeypatch, tmp_path)
        p.write_text("{ not valid json")
        cs = connection_store.list_connections()
        assert len(cs) == 1 and cs[0].is_default
        # Malformed is treated like missing for the registry decision.
        assert connection_store.get_active_id() is None

    def test_atomic_write_leaves_no_tmp(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        connection_store.add_connection(label="X", engine="sqlite", url="sqlite:///x.db")
        assert not (tmp_path / "databases.json.tmp").exists()

    def test_round_trip_preserves_fields(self, monkeypatch, tmp_path):
        _set_path(monkeypatch, tmp_path)
        cid = connection_store.add_connection(label="PG", engine="postgresql", url="postgresql://u:p@h:5432/db")
        # Re-read from disk by clearing any in-process caching (store re-reads each call).
        got = connection_store.get_connection(cid)
        assert got is not None
        assert isinstance(got, StoredConnection)
        assert got.engine == "postgresql"
        assert got.label == "PG"
        assert got.created_at is not None
