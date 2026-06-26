"""Database connection testing + activation logic (Milestone 3).

``test_connection`` builds a throwaway engine, pings it, disposes it, and returns
a redacted ``ConnectionTest`` — the URL/password never appears in any error.

``activate`` runs the test → migrate-target → swap-active → reload-registry
sequence. On any failure the active connection is left unchanged (PRD OQ #57 for
M3: no data copy yet, so "rollback" = "don't swap"). Data migration from the
source DB is M4.
"""

from dataclasses import dataclass

from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

from app.db import connection_store
from app.db.engines.base import ConnectionTest
from app.db.engines.registry import reload_active_engine
from app.services.security.redact import redact_message

_DRIVER_MISSING = "Database driver for this engine is not installed."


def _safe_error(exc: Exception, url: str) -> str:
    """Return an exception message with the URL and password scrubbed."""
    if isinstance(exc, ModuleNotFoundError):
        # The dbapi module name (e.g. psycopg2) is irrelevant to the user and
        # not secret, but the message is clearer without it.
        return _DRIVER_MISSING
    try:
        password = make_url(url).password or ""
    except Exception:
        password = ""
    return redact_message(str(exc), url, password)


def test_connection(engine_type: str, url: str) -> ConnectionTest:
    """Ping a URL with a throwaway engine. Never raises; never leaks secrets.

    ``engine_type`` is accepted for API symmetry but behavior is derived from the
    URL's dialect (the authoritative source): SQLite needs ``check_same_thread``
    off, other dialects get a ``connect_timeout`` to bound the wait.
    """
    try:
        try:
            driver = make_url(url).drivername
        except Exception:
            driver = ""

        connect_args: dict[str, object] = {}
        if driver.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        else:
            connect_args["connect_timeout"] = 5

        eng = create_engine(url, connect_args=connect_args)
        try:
            with eng.connect() as conn:
                conn.execute(text("SELECT 1"))
        finally:
            eng.dispose()
        return ConnectionTest(ok=True)
    except Exception as exc:
        return ConnectionTest(ok=False, error=_safe_error(exc, url))


def _migrate_target(url: str) -> ConnectionTest:
    """Run ``alembic upgrade head`` against the target URL so its schema exists.

    Honored by ``migrations/env.py`` (which injects the active URL only when none
    is set). Idempotent against already-migrated DBs.
    """
    try:
        import alembic.command
        import alembic.config

        cfg = alembic.config.Config("alembic.ini")
        cfg.set_main_option("sqlalchemy.url", url)
        alembic.command.upgrade(cfg, "head")
        return ConnectionTest(ok=True)
    except Exception as exc:
        return ConnectionTest(ok=False, error=_safe_error(exc, url))


@dataclass(frozen=True)
class ActivateResult:
    """Outcome of an activation attempt. On failure, ``test`` carries the reason."""

    ok: bool
    connection: connection_store.StoredConnection | None
    test: ConnectionTest | None


def activate(id: str) -> ActivateResult:
    """Switch the active connection to ``id`` on full success.

    Sequence: load → test connection → migrate target → set active → reload the
    registry singleton. Any failure returns ``ok=False`` and leaves the current
    active connection untouched.
    """
    conn = connection_store.get_connection(id)
    if conn is None:
        return ActivateResult(
            ok=False,
            connection=None,
            test=ConnectionTest(ok=False, error="Connection not found"),
        )

    test = test_connection(conn.engine, conn.url)
    if not test.ok:
        return ActivateResult(ok=False, connection=None, test=test)

    migration = _migrate_target(conn.url)
    if not migration.ok:
        return ActivateResult(ok=False, connection=None, test=migration)

    connection_store.set_active(id)
    reload_active_engine()
    return ActivateResult(ok=True, connection=conn, test=None)
