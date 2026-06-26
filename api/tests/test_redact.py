"""Tests for URL/credential redaction helpers (Milestone 3 security).

These helpers are the load-bearing control against credential leakage: every
connection-test error and read response passes through them so a URL/password
can never reach a response body or log line.
"""

from app.services.security import redact


class TestRedactUrl:
    def test_password_replaced_with_markers(self):
        out = redact.redact_url("postgresql://user:secret@host:5432/db")
        assert "secret" not in out
        assert "***" in out

    def test_non_secret_parts_preserved(self):
        out = redact.redact_url("postgresql://user:secret@host:5432/db")
        assert "host" in out
        assert "5432" in out
        assert "db" in out

    def test_no_password_unchanged(self):
        assert redact.redact_url("sqlite:///home/me/l1br3.db") == "sqlite:///home/me/l1br3.db"

    def test_invalid_url_does_not_raise_or_leak(self):
        out = redact.redact_url("this is not a url at all")
        assert out == "***"


class TestUrlHasPassword:
    def test_true_when_password_present(self):
        assert redact.url_has_password("postgresql://u:p@host:5432/db") is True

    def test_false_when_absent(self):
        assert redact.url_has_password("postgresql://u@host:5432/db") is False

    def test_false_for_sqlite(self):
        assert redact.url_has_password("sqlite:///x.db") is False

    def test_false_for_invalid(self):
        assert redact.url_has_password("garbage") is False


class TestRedactMessage:
    def test_strips_provided_secret_substrings(self):
        url = "postgresql://user:supersecret@host:5432/db"
        msg = f"could not connect to {url} within timeout"
        out = redact.redact_message(msg, url, "supersecret")
        assert "supersecret" not in out
        assert "postgresql://user:supersecret" not in out

    def test_no_secrets_passes_text_through(self):
        assert redact.redact_message("plain error", "") == "plain error"
