"""Pure-function tests for the F19 master-key portability substrate."""

from cryptography.fernet import Fernet

from app.services.security.master_key_portability import (
    BUNDLE_VERSION,
    BundleError,
    export_bundle,
    import_bundle,
)

MASTER_KEY = Fernet.generate_key().decode()


class TestRoundTrip:
    def test_round_trip_preserves_master_key(self):
        bundle = export_bundle(MASTER_KEY, "correct horse battery staple")
        assert import_bundle(bundle, "correct horse battery staple") == MASTER_KEY

    def test_salt_is_random_per_export(self):
        a = export_bundle(MASTER_KEY, "same passphrase")
        b = export_bundle(MASTER_KEY, "same passphrase")
        assert a["salt"] != b["salt"]
        assert a["ciphertext"] != b["ciphertext"]
        # Both still decrypt back to the same key under the same passphrase.
        assert import_bundle(a, "same passphrase") == MASTER_KEY
        assert import_bundle(b, "same passphrase") == MASTER_KEY


class TestBundleShape:
    def test_bundle_has_required_fields(self):
        bundle = export_bundle(MASTER_KEY, "pw")
        assert bundle["version"] == BUNDLE_VERSION == 1
        assert bundle["kdf"] == "scrypt"
        assert isinstance(bundle["salt"], str)
        assert bundle["params"] == {"N": 16384, "r": 8, "p": 1}
        assert isinstance(bundle["ciphertext"], str)

    def test_bundle_contains_no_plaintext_master_key(self):
        bundle = export_bundle(MASTER_KEY, "pw")
        # The bundle is JSON-serializable; the master key string must not
        # appear anywhere in the serialization (only the Fernet token does).
        import json

        serialized = json.dumps(bundle)
        assert MASTER_KEY not in serialized
        # Even the second half of the key (a substring that survives splits)
        # must not appear.
        assert MASTER_KEY[len(MASTER_KEY) // 2 :] not in serialized


class TestImportFailures:
    def test_wrong_passphrase_raises_bundle_error(self):
        bundle = export_bundle(MASTER_KEY, "right passphrase")
        try:
            import_bundle(bundle, "wrong passphrase")
            raise AssertionError("expected BundleError")
        except BundleError as exc:
            # Ambiguous message — no oracle about WHICH thing went wrong.
            assert "wrong passphrase or corrupted file" in str(exc)
            # No master-key bytes leak through the exception text.
            assert MASTER_KEY not in str(exc)

    def test_unknown_version_refused_before_crypto(self):
        bundle = export_bundle(MASTER_KEY, "pw")
        bundle["version"] = 999
        try:
            import_bundle(bundle, "pw")
            raise AssertionError("expected BundleError")
        except BundleError as exc:
            assert "unsupported bundle version" in str(exc)

    def test_unknown_kdf_refused(self):
        bundle = export_bundle(MASTER_KEY, "pw")
        bundle["kdf"] = "argon2id"
        try:
            import_bundle(bundle, "pw")
            raise AssertionError("expected BundleError")
        except BundleError as exc:
            assert "unsupported kdf" in str(exc)

    def test_malformed_bundle_missing_keys(self):
        try:
            import_bundle({"version": 1, "kdf": "scrypt"}, "pw")
            raise AssertionError("expected BundleError")
        except BundleError as exc:
            assert "malformed bundle" in str(exc)

    def test_malformed_bundle_bad_base64(self):
        bundle = export_bundle(MASTER_KEY, "pw")
        bundle["salt"] = "!!!not base64!!!"
        try:
            import_bundle(bundle, "pw")
            raise AssertionError("expected BundleError")
        except BundleError as exc:
            assert "malformed bundle" in str(exc)

    def test_non_dict_bundle_raises(self):
        try:
            import_bundle(["not", "a", "dict"], "pw")  # type: ignore[arg-type]
            raise AssertionError("expected BundleError")
        except BundleError as exc:
            assert "malformed bundle" in str(exc) or "must be a JSON object" in str(exc)
