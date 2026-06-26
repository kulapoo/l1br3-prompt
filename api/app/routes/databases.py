"""Database Manager routes (Milestone 3).

Mirrors ``app.routes.providers``: an ``ApiResponse`` envelope, a ``_to_read``
helper that converts the stored connection into the credential-free Read shape,
and standard CRUD. Two extra non-CRUD endpoints:
  - ``POST /test``     — ping a URL with a throwaway engine (does not persist).
  - ``POST /{id}/activate`` — test → migrate → swap active → reload the registry.
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.engine.url import make_url

from app.db import connection_store
from app.schemas.database import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    DatabaseConnectionCreate,
    DatabaseConnectionRead,
    DatabaseConnectionUpdate,
)
from app.schemas.envelope import ApiResponse
from app.services.db_connection_service import activate, test_connection
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
