"""Master-key portability routes (F19).

Three endpoints under ``/api/v1/security/master-key/``:

  - ``GET  /status``  — file presence + env-override flag.
  - ``POST /export``  — wrap the current master key under a passphrase-derived
                         Fernet and return the JSON envelope.
  - ``POST /import``  — validate a bundle, atomically write ``master.key``
                         (0600, temp + os.replace), and clear both module caches
                         so the new key takes effect without an app restart.

``import`` refuses (409) when ``L1BR3_MASTER_KEY`` env var is set, since writing
the file would have no effect. ``export`` succeeds but warns under the same
condition.

Error responses use the ``ApiResponse.fail`` envelope with a non-200 status code
(via the ``Response`` parameter) so clients can read ``body.error`` uniformly.
``DEFAULT_MASTER_KEY_PATH`` is read through the ``config`` module at call time
so test fixtures that monkeypatch the module attribute take effect.
"""

import os

from fastapi import APIRouter, Response, status

from app import config
from app.schemas.envelope import ApiResponse
from app.schemas.security import (
    ExportRequest,
    ExportResponse,
    ImportRequest,
    ImportResult,
    MasterKeyStatus,
)
from app.services.security.crypto import clear_fernet_cache
from app.services.security.master_key_portability import BundleError, export_bundle, import_bundle

router = APIRouter(prefix="/api/v1/security/master-key", tags=["security"])

_ENV_OVERRIDE_EXPORT_WARNING = (
    "L1BR3_MASTER_KEY env var is set; the exported bundle wraps the env-derived key, not the master.key file."
)
_ENV_OVERRIDE_IMPORT_ERROR = "L1BR3_MASTER_KEY env var overrides the master.key file; unset it before importing."


@router.get("/status", response_model=ApiResponse[MasterKeyStatus])
def get_status() -> ApiResponse[MasterKeyStatus]:
    return ApiResponse.ok(
        MasterKeyStatus(
            present=config.DEFAULT_MASTER_KEY_PATH.exists(),
            env_override=bool(os.environ.get("L1BR3_MASTER_KEY")),
        )
    )


@router.post("/export", response_model=ApiResponse[ExportResponse])
def post_export(req: ExportRequest, response: Response) -> ApiResponse[ExportResponse]:
    if not req.passphrase:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return ApiResponse.fail("passphrase required")
    bundle = export_bundle(config.get_master_key(), req.passphrase)
    warning = _ENV_OVERRIDE_EXPORT_WARNING if os.environ.get("L1BR3_MASTER_KEY") else None
    return ApiResponse.ok(ExportResponse(bundle=bundle, warning=warning))


@router.post(
    "/import",
    response_model=ApiResponse[ImportResult],
    status_code=status.HTTP_201_CREATED,
)
def post_import(req: ImportRequest, response: Response) -> ApiResponse[ImportResult]:
    if os.environ.get("L1BR3_MASTER_KEY"):
        response.status_code = status.HTTP_409_CONFLICT
        return ApiResponse.fail(_ENV_OVERRIDE_IMPORT_ERROR)
    try:
        master_key = import_bundle(req.bundle, req.passphrase)
    except BundleError as exc:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return ApiResponse.fail(str(exc))

    previous_present = config.DEFAULT_MASTER_KEY_PATH.exists()
    _write_master_key_file(master_key)
    config.clear_master_key_cache()
    clear_fernet_cache()
    return ApiResponse.ok(ImportResult(imported=True, previous_key_present=previous_present))


def _write_master_key_file(master_key: str) -> None:
    """Atomic write of the master key to ``DEFAULT_MASTER_KEY_PATH`` (0600)."""
    path = config.DEFAULT_MASTER_KEY_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / (path.name + ".tmp")
    tmp.write_text(master_key)
    os.replace(tmp, path)
    try:
        path.chmod(0o600)
    except OSError:
        # Filesystem may not support chmod (e.g. some Windows mounts); non-fatal.
        pass
