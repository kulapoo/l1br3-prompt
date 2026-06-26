"""Credential redaction helpers for database connection URLs.

These are the load-bearing control against secret leakage in the Database
Manager (M3). Every connection-test error and read response passes through
``redact_url`` / ``redact_message`` so a URL or password can never reach a
response body or log line. Mirrors the philosophy of ``app.services.security.crypto``:
security primitives live in one place.
"""

from sqlalchemy.engine.url import make_url


def redact_url(url: str) -> str:
    """Return the URL with any password replaced by ``***``. Never raises.

    On any parse failure, returns ``"***"`` rather than echoing the (possibly
    secret-laden) input.
    """
    try:
        # render_as_string defaults to hide_password=True, rendering "***".
        return make_url(url).render_as_string()
    except Exception:
        return "***"


def url_has_password(url: str) -> bool:
    """True iff the URL parses and carries an embedded password."""
    try:
        return make_url(url).password is not None
    except Exception:
        return False


def redact_message(text: str, *secrets: str) -> str:
    """Strip any provided secret substrings from ``text``.

    Used to scrub exception strings (which may echo the DSN) before they become
    a response error. Empty/None secrets are ignored.
    """
    redacted = text
    for secret in secrets:
        if secret:
            redacted = redacted.replace(secret, "***")
    return redacted
