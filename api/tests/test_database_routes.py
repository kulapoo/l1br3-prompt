"""Tests for /api/v1/databases — Database Manager (Milestone 3).

Critical guarantees (mirrors test_provider_routes.py):
  - The Read shape NEVER includes the raw url or password; only a masked URL +
    has_password flag.
  - Create/Update validate that the URL parses.
  - The connection-test path never leaks the URL or password in any response or
    error.
"""

import pytest
from pydantic import ValidationError

from app.schemas.database import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    DatabaseConnectionCreate,
    DatabaseConnectionRead,
    DatabaseConnectionUpdate,
)

# ── Schema layer ─────────────────────────────────────────────────────────────


class TestCreateSchema:
    def test_accepts_valid_postgres_url(self):
        c = DatabaseConnectionCreate(label="PG", engine="postgresql", url="postgresql://u:p@host:5432/db")
        assert c.engine == "postgresql"
        assert c.url == "postgresql://u:p@host:5432/db"

    def test_accepts_valid_sqlite_url(self):
        c = DatabaseConnectionCreate(label="S", engine="sqlite", url="sqlite:///x.db")
        assert c.engine == "sqlite"

    def test_rejects_unparseable_url(self):
        with pytest.raises(ValidationError):
            DatabaseConnectionCreate(label="X", engine="sqlite", url="not a url :::")

    def test_rejects_invalid_engine(self):
        with pytest.raises(ValidationError):
            DatabaseConnectionCreate(label="X", engine="mysql", url="sqlite:///x.db")

    def test_accepts_camel_case_aliases(self):
        c = DatabaseConnectionCreate.model_validate({"label": "X", "engine": "sqlite", "url": "sqlite:///x.db"})
        assert c.label == "X"


class TestUpdateSchema:
    def test_partial_update_ok(self):
        u = DatabaseConnectionUpdate(label="Y")
        assert u.label == "Y"
        assert u.url is None

    def test_rejects_unparseable_url(self):
        with pytest.raises(ValidationError):
            DatabaseConnectionUpdate(url="not a url :::")


class TestReadSchemaNeverLeaksSecrets:
    def test_read_has_no_url_or_password_field(self):
        r = DatabaseConnectionRead(
            id="x",
            label="PG",
            engine="postgresql",
            has_password=True,
            host="h",
            port=5432,
            database="db",
            masked_url="postgresql://u:***@h:5432/db",
        )
        dumped = r.model_dump(by_alias=True)
        assert "url" not in dumped
        assert "password" not in dumped
        assert "maskedUrl" in dumped
        assert "hasPassword" in dumped
        assert "isActive" in dumped
        assert "isDefault" in dumped

    def test_read_camel_case_serialization(self):
        r = DatabaseConnectionRead(
            id="x",
            label="PG",
            engine="postgresql",
            has_password=True,
            host="h",
            port=5432,
            database="db",
            masked_url="postgresql://u:***@h:5432/db",
            is_active=True,
            is_default=False,
        )
        dumped = r.model_dump(by_alias=True)
        assert dumped["hasPassword"] is True
        assert dumped["maskedUrl"] == "postgresql://u:***@h:5432/db"
        assert dumped["host"] == "h"
        assert dumped["port"] == 5432
        assert dumped["isActive"] is True
        assert dumped["isDefault"] is False


class TestConnectionTestSchemas:
    def test_request_rejects_unparseable_url(self):
        with pytest.raises(ValidationError):
            ConnectionTestRequest(engine="sqlite", url="not a url :::")

    def test_response_serializes_ok(self):
        r = ConnectionTestResponse(ok=True, error=None)
        assert r.model_dump(by_alias=True)["ok"] is True

    def test_response_serializes_error(self):
        r = ConnectionTestResponse(ok=False, error="unreachable")
        dumped = r.model_dump(by_alias=True)
        assert dumped["ok"] is False
        assert dumped["error"] == "unreachable"


# ── Route integration ────────────────────────────────────────────────────────

PASSWORD = "supersecret"


def _store_path(monkeypatch, tmp_path):
    p = tmp_path / "dbs.json"
    monkeypatch.setenv("L1BR3_DATABASES_CONFIG", str(p))
    return p


class TestRouteCrud:
    def test_list_returns_seeded_default(self, client, monkeypatch, tmp_path):
        _store_path(monkeypatch, tmp_path)
        r = client.get("/api/v1/databases")
        assert r.status_code == 200
        data = r.json()["data"]
        assert len(data) == 1
        assert data[0]["engine"] == "sqlite"
        assert data[0]["isActive"] is True
        assert data[0]["isDefault"] is True
        assert "url" not in data[0]
        assert "password" not in data[0]

    def test_create_returns_read_without_secret(self, client, monkeypatch, tmp_path):
        _store_path(monkeypatch, tmp_path)
        r = client.post(
            "/api/v1/databases",
            json={"label": "PG", "engine": "postgresql", "url": f"postgresql://u:{PASSWORD}@h:5432/db"},
        )
        assert r.status_code == 201, r.text
        body = r.text
        assert PASSWORD not in body
        data = r.json()["data"]
        assert data["engine"] == "postgresql"
        assert data["hasPassword"] is True
        assert data["maskedUrl"].count("***") == 1
        assert PASSWORD not in data["maskedUrl"]
        assert "url" not in data

    def test_create_rejects_unparseable_url(self, client, monkeypatch, tmp_path):
        _store_path(monkeypatch, tmp_path)
        r = client.post("/api/v1/databases", json={"label": "X", "engine": "sqlite", "url": "not a url :::"})
        assert r.status_code == 422

    def test_get_one_and_404(self, client, monkeypatch, tmp_path):
        _store_path(monkeypatch, tmp_path)
        created = client.post(
            "/api/v1/databases", json={"label": "X", "engine": "sqlite", "url": "sqlite:///x.db"}
        ).json()["data"]
        r = client.get(f"/api/v1/databases/{created['id']}")
        assert r.status_code == 200
        assert r.json()["data"]["label"] == "X"
        assert client.get("/api/v1/databases/does-not-exist").status_code == 404

    def test_patch_updates_label(self, client, monkeypatch, tmp_path):
        _store_path(monkeypatch, tmp_path)
        created = client.post(
            "/api/v1/databases", json={"label": "X", "engine": "sqlite", "url": "sqlite:///x.db"}
        ).json()["data"]
        r = client.patch(f"/api/v1/databases/{created['id']}", json={"label": "Y"})
        assert r.status_code == 200
        assert r.json()["data"]["label"] == "Y"

    def test_delete_removes(self, client, monkeypatch, tmp_path):
        _store_path(monkeypatch, tmp_path)
        created = client.post(
            "/api/v1/databases", json={"label": "X", "engine": "sqlite", "url": "sqlite:///x.db"}
        ).json()["data"]
        r = client.delete(f"/api/v1/databases/{created['id']}")
        assert r.status_code == 200
        assert client.get(f"/api/v1/databases/{created['id']}").status_code == 404

    def test_delete_default_refused(self, client, monkeypatch, tmp_path):
        _store_path(monkeypatch, tmp_path)
        from app.db.connection_store import DEFAULT_CONNECTION_ID

        r = client.delete(f"/api/v1/databases/{DEFAULT_CONNECTION_ID}")
        assert r.status_code == 400


class TestRouteTest:
    def test_test_ok(self, client, monkeypatch):
        from app.db.engines.base import ConnectionTest

        monkeypatch.setattr(
            "app.routes.databases.test_connection",
            lambda engine, url: ConnectionTest(ok=True),
        )
        r = client.post(
            "/api/v1/databases/test",
            json={"engine": "sqlite", "url": "sqlite:///x.db"},
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["ok"] is True
        assert data["error"] is None

    def test_test_fail_redacts(self, client, monkeypatch):
        from app.db.engines.base import ConnectionTest

        # The service layer always redacts; this route-level test mocks a clean
        # error and asserts the request's password (in the URL body) is never
        # echoed back in the response.
        monkeypatch.setattr(
            "app.routes.databases.test_connection",
            lambda engine, url: ConnectionTest(ok=False, error="connection refused"),
        )
        r = client.post(
            "/api/v1/databases/test",
            json={"engine": "postgresql", "url": f"postgresql://u:{PASSWORD}@h:5432/db"},
        )
        assert r.status_code == 200
        assert PASSWORD not in r.text


class TestRouteActivate:
    def test_activate_success(self, client, monkeypatch, tmp_path):
        from app.db import connection_store
        from app.services.db_connection_service import ActivateResult

        _store_path(monkeypatch, tmp_path)
        created = client.post(
            "/api/v1/databases", json={"label": "X", "engine": "sqlite", "url": "sqlite:///x.db"}
        ).json()["data"]
        target = next(c for c in client.get("/api/v1/databases").json()["data"] if c["id"] == created["id"])

        def fake_activate(id_):
            # Mirror the real side effect: activate persists the active id.
            connection_store.set_active(id_)
            return ActivateResult(ok=True, connection=_fake_conn(target), test=None)

        monkeypatch.setattr("app.routes.databases.activate", fake_activate)
        r = client.post(f"/api/v1/databases/{created['id']}/activate")
        assert r.status_code == 200
        assert r.json()["data"]["isActive"] is True

    def test_activate_failure_returns_400(self, client, monkeypatch, tmp_path):
        from app.db.engines.base import ConnectionTest
        from app.services.db_connection_service import ActivateResult

        _store_path(monkeypatch, tmp_path)
        monkeypatch.setattr(
            "app.routes.databases.activate",
            lambda id_: ActivateResult(
                ok=False,
                connection=None,
                test=ConnectionTest(ok=False, error="unreachable"),
            ),
        )
        r = client.post("/api/v1/databases/whatever/activate")
        assert r.status_code == 400
        assert "unreachable" in r.text
        assert PASSWORD not in r.text


def _fake_conn(read_dict):
    """Build a StoredConnection from a Read dict for the mocked activate path."""
    from datetime import UTC, datetime

    from app.db.connection_store import StoredConnection

    # Reconstruct an unmasked url is not possible from the Read; the mocked
    # activate only needs id/engine/label for _to_read, so url is a placeholder.
    return StoredConnection(
        id=read_dict["id"],
        label=read_dict["label"],
        engine=read_dict["engine"],
        url="sqlite:///placeholder.db",
        created_at=datetime.now(UTC),
        is_default=False,
    )
