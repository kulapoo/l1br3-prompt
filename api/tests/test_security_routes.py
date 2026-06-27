"""Route integration tests for the F19 master-key portability endpoints."""

import stat

import pytest

from app.services.security.master_key_portability import export_bundle


@pytest.fixture
def isolated_key_path(tmp_path, monkeypatch):
    """Point DEFAULT_MASTER_KEY_PATH at a tmp file and clear all caches."""
    key_path = tmp_path / "master.key"
    monkeypatch.setattr("app.config.DEFAULT_MASTER_KEY_PATH", key_path)
    monkeypatch.delenv("L1BR3_MASTER_KEY", raising=False)
    import app.config
    import app.services.security.crypto as crypto_mod

    app.config._cached_master_key = None
    crypto_mod._fernet = None
    yield key_path
    app.config._cached_master_key = None
    crypto_mod._fernet = None


class TestStatus:
    def test_status_no_file_no_env(self, client, isolated_key_path):
        r = client.get("/api/v1/security/master-key/status")
        assert r.status_code == 200
        body = r.json()["data"]
        assert body["present"] is False
        assert body["envOverride"] is False

    def test_status_file_present(self, client, isolated_key_path):
        # Touch the file so the route sees it.
        isolated_key_path.write_text("Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA=")
        r = client.get("/api/v1/security/master-key/status")
        body = r.json()["data"]
        assert body["present"] is True
        assert body["envOverride"] is False

    def test_status_env_override(self, client, isolated_key_path, monkeypatch):
        monkeypatch.setenv("L1BR3_MASTER_KEY", "Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA=")
        r = client.get("/api/v1/security/master-key/status")
        body = r.json()["data"]
        assert body["envOverride"] is True


class TestExport:
    def test_export_returns_bundle_envelope(self, client, isolated_key_path):
        # Pin a deterministic master key via the file (env unset by fixture) so
        # no env-override warning fires and we can focus on the bundle shape.
        master_key = "Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA="
        isolated_key_path.write_text(master_key)
        isolated_key_path.chmod(0o600)
        import app.config

        app.config._cached_master_key = None
        r = client.post("/api/v1/security/master-key/export", json={"passphrase": "pw"})
        assert r.status_code == 200
        body = r.json()["data"]
        assert body["bundle"]["version"] == 1
        assert body["bundle"]["kdf"] == "scrypt"
        assert body["bundle"]["params"] == {"N": 16384, "r": 8, "p": 1}
        assert "ciphertext" in body["bundle"]
        assert body["warning"] is None
        # Plaintext master key never appears in the response.
        assert master_key not in r.text

    def test_export_warns_when_env_override_active(self, client, isolated_key_path, monkeypatch):
        monkeypatch.setenv("L1BR3_MASTER_KEY", "Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA=")
        import app.config

        app.config._cached_master_key = None
        r = client.post("/api/v1/security/master-key/export", json={"passphrase": "pw"})
        body = r.json()["data"]
        assert body["warning"] is not None
        assert "env" in body["warning"].lower()

    def test_export_rejects_empty_passphrase(self, client, isolated_key_path):
        r = client.post("/api/v1/security/master-key/export", json={"passphrase": ""})
        assert r.status_code == 400


class TestImport:
    def test_import_writes_file_and_clears_caches(self, client, isolated_key_path, monkeypatch):
        master_key = "Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA="
        bundle = export_bundle(master_key, "pw")
        # Pre-seed the cache with a DIFFERENT key to prove import clears it.
        monkeypatch.setenv("L1BR3_MASTER_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        import app.config

        app.config._cached_master_key = None
        # Force cache population under the wrong key.
        from app.config import get_master_key

        assert get_master_key() == "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        # Now unset env so the import route will write the file.
        monkeypatch.delenv("L1BR3_MASTER_KEY")
        app.config._cached_master_key = None

        r = client.post("/api/v1/security/master-key/import", json={"passphrase": "pw", "bundle": bundle})
        assert r.status_code == 201
        body = r.json()["data"]
        assert body["imported"] is True
        assert body["previousKeyPresent"] is False

        # File written, 0600.
        assert isolated_key_path.exists()
        assert stat.S_IMODE(isolated_key_path.stat().st_mode) == 0o600
        # Cache cleared: get_master_key() now returns the imported key.
        assert get_master_key() == master_key

    def test_import_overwrite_marks_previous_present(self, client, isolated_key_path, monkeypatch):
        isolated_key_path.write_text("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        isolated_key_path.chmod(0o600)
        master_key = "Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA="
        bundle = export_bundle(master_key, "pw")
        r = client.post("/api/v1/security/master-key/import", json={"passphrase": "pw", "bundle": bundle})
        body = r.json()["data"]
        assert body["previousKeyPresent"] is True

    def test_import_wrong_passphrase_returns_400(self, client, isolated_key_path):
        bundle = export_bundle("Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA=", "right")
        r = client.post("/api/v1/security/master-key/import", json={"passphrase": "wrong", "bundle": bundle})
        assert r.status_code == 400
        assert "wrong passphrase or corrupted file" in r.json()["error"]

    def test_import_malformed_bundle_returns_400(self, client, isolated_key_path):
        r = client.post(
            "/api/v1/security/master-key/import",
            json={"passphrase": "pw", "bundle": {"version": 999}},
        )
        assert r.status_code == 400
        assert "unsupported bundle version" in r.json()["error"]

    def test_import_refuses_when_env_override_active(self, client, isolated_key_path, monkeypatch):
        monkeypatch.setenv("L1BR3_MASTER_KEY", "Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA=")
        bundle = export_bundle("Zml3svR2480OXOG9Cgwc7qU4cNxKswTWYyhRlueA-dA=", "pw")
        r = client.post("/api/v1/security/master-key/import", json={"passphrase": "pw", "bundle": bundle})
        assert r.status_code == 409
        assert "L1BR3_MASTER_KEY" in r.json()["error"]
