"""Database Manager routes (Milestone 3).

Mirrors ``app.routes.providers``: an ``ApiResponse`` envelope, a ``_to_read``
helper that converts the stored connection into the credential-free Read shape,
and standard CRUD. Two extra non-CRUD endpoints:
  - ``POST /test``     — ping a URL with a throwaway engine (does not persist).
  - ``POST /{id}/activate`` — test → migrate → swap active → reload the registry.

Milestone 4 adds:
  - ``POST /{id}/migrate`` — streaming data copy (SSE) from the active source to
    the target, then swap. On any failure the source stays active and the target
    transaction is rolled back; the redacted error is emitted as a final frame.
"""

import json
from collections.abc import Iterator

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.engine.url import make_url
from starlette.concurrency import run_in_threadpool

from app.db import connection_store
from app.db.engines.registry import build_engine_for_url, get_active_engine, reload_active_engine
from app.schemas.database import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    DatabaseConnectionCreate,
    DatabaseConnectionRead,
    DatabaseConnectionUpdate,
    MigrationMetaRead,
    MigrationProgressRead,
)
from app.schemas.envelope import ApiResponse
from app.services.db_connection_service import _migrate_target, _safe_error, activate, test_connection
from app.services.migration_service import MigrationEvent, MigrationMeta, TableProgress, iter_migration
from app.services.security.redact import redact_url, url_has_password

router = APIRouter(prefix="/api/v1/databases", tags=["databases"])


def _to_read(conn: connection_store.StoredConnection, active_id: str | None = None) -> DatabaseConnectionRead:
    """Convert a stored connection to the credential-free Read shape.

    ``active_id`` is passed in by list handlers (computed once) to avoid an
    N-fold file re-read; single-connection handlers leave it None.
    """
    if active_id is None:
        active_id = connection_store.get_active_id()
    # When nothing is persisted, the default SQLite is the implicit active
    # (the registry falls through to it), so reflect that in the badge.
    effective_active = active_id if active_id else connection_store.DEFAULT_CONNECTION_ID
    try:
        u = make_url(conn.url)
        host, port, database = u.host, u.port, u.database
    except Exception:
        host = port = database = None
    return DatabaseConnectionRead(
        id=conn.id,
        label=conn.label,
        engine=conn.engine,
        has_password=url_has_password(conn.url),
        host=host,
        port=port,
        database=database,
        masked_url=redact_url(conn.url),
        is_active=effective_active == conn.id,
        is_default=conn.is_default,
    )


@router.get("", response_model=ApiResponse[list[DatabaseConnectionRead]])
def list_connections():
    active_id = connection_store.get_active_id()
    return ApiResponse.ok([_to_read(c, active_id) for c in connection_store.list_connections()])


@router.post(
    "",
    response_model=ApiResponse[DatabaseConnectionRead],
    status_code=status.HTTP_201_CREATED,
)
def create_connection(data: DatabaseConnectionCreate):
    cid = connection_store.add_connection(label=data.label, engine=data.engine, url=data.url)
    conn = connection_store.get_connection(cid)
    assert conn is not None
    return ApiResponse.ok(_to_read(conn))


@router.post("/test", response_model=ApiResponse[ConnectionTestResponse])
def test_connection_route(data: ConnectionTestRequest):
    # Registered before /{id} so the literal path wins. Does not persist.
    result = test_connection(data.engine, data.url)
    return ApiResponse.ok(ConnectionTestResponse(ok=result.ok, error=result.error))


@router.get("/{id}", response_model=ApiResponse[DatabaseConnectionRead])
def get_connection(id: str):
    conn = connection_store.get_connection(id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return ApiResponse.ok(_to_read(conn))


@router.patch("/{id}", response_model=ApiResponse[DatabaseConnectionRead])
def update_connection(id: str, data: DatabaseConnectionUpdate):
    conn = connection_store.update_connection(id, label=data.label, url=data.url)
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return ApiResponse.ok(_to_read(conn))


@router.delete("/{id}", response_model=ApiResponse[None])
def delete_connection(id: str):
    # Refuses the default and the currently-active connection (returns False).
    if not connection_store.delete_connection(id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete: connection is missing, is the default, or is currently active.",
        )
    return ApiResponse.ok(None)


@router.post("/{id}/activate", response_model=ApiResponse[DatabaseConnectionRead])
def activate_connection(id: str):
    result = activate(id)
    if not result.ok:
        detail = result.test.error if result.test and result.test.error else "Activation failed"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    assert result.connection is not None
    return ApiResponse.ok(_to_read(result.connection))


# ── Migration wizard (Milestone 4) ───────────────────────────────────────────


class _StreamComplete(Exception):
    """Sentinel raised by ``_advance`` when the migration generator is exhausted.

    Using a custom sentinel (not ``StopIteration``) avoids PEP 479 ambiguity when
    ``next(gen)`` is driven through ``run_in_threadpool`` from an async generator.
    """


def _advance(gen: Iterator[MigrationEvent]) -> MigrationEvent:
    """``next(gen)`` that signals completion via ``_StreamComplete``."""
    try:
        return next(gen)
    except StopIteration as exc:
        raise _StreamComplete from exc


def _meta_frame(meta: MigrationMeta) -> str:
    payload = MigrationMetaRead(
        source_engine=meta.source_engine, target_engine=meta.target_engine, tables=meta.tables
    ).model_dump(by_alias=True)
    return f"data: {json.dumps({'meta': payload})}\n\n"


def _progress_frame(p: TableProgress) -> str:
    payload = MigrationProgressRead(table=p.table, phase=p.phase, copied=p.copied, total=p.total).model_dump(
        by_alias=True
    )
    return f"data: {json.dumps({'progress': payload})}\n\n"


def _error_frame(message: str) -> str:
    return f"data: {json.dumps({'error': message})}\n\n"


@router.post("/{id}/migrate")
async def migrate_connection(id: str, request: Request):
    """Stream the data copy from the active source to connection ``id`` as SSE.

    Sequence: load target → test → migrate target schema → stream the copy. The
    active connection swaps ONLY after the copy commits (the ``{done}`` frame);
    any failure emits a redacted ``{error}`` frame and leaves the source active.
    On client disconnect the open target transaction is rolled back via
    ``gen.close()``.
    """
    conn = connection_store.get_connection(id)
    if conn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")

    # Pre-checks mirror activate: ping the target, then build its schema. Any
    # failure here is a normal HTTP error (no stream opened, source untouched).
    test = test_connection(conn.engine, conn.url)
    if not test.ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=test.error or "Connection test failed")
    migration = _migrate_target(conn.url)
    if not migration.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=migration.error or "Target schema migration failed",
        )

    source = get_active_engine()
    target = build_engine_for_url(conn.url)

    async def event_stream():
        gen = iter_migration(source, target)
        try:
            meta = await run_in_threadpool(_advance, gen)
        except _StreamComplete:
            return  # nothing to copy (generator yielded only its meta then ended — not expected)
        except Exception as exc:
            yield _error_frame(_safe_error(exc, conn.url))
            return
        yield _meta_frame(meta)

        while True:
            if await request.is_disconnected():
                gen.close()  # GeneratorExit → the target transaction rolls back
                return
            try:
                event = await run_in_threadpool(_advance, gen)
            except _StreamComplete:
                # Copy committed cleanly — swap active + reload the registry.
                connection_store.set_active(id)
                reload_active_engine()
                yield 'data: {"done": true}\n\n'
                return
            except Exception as exc:
                yield _error_frame(_safe_error(exc, conn.url))
                return
            # Only TableProgress events follow the meta frame.
            if isinstance(event, TableProgress):
                yield _progress_frame(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
