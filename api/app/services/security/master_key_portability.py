"""Passphrase-protected master-key bundle for cross-host portability (F19).

The bundle is a versioned JSON envelope wrapping the master key under a
passphrase-derived Fernet:

    {
      "version": 1,
      "kdf": "scrypt",
      "salt": "<base64 16 random bytes>",
      "params": {"N": 16384, "r": 8, "p": 1},
      "ciphertext": "<Fernet token of master key string>"
    }

``export_bundle`` produces one; ``import_bundle`` validates and unwraps one.
Both are pure functions (no I/O). The route layer handles file writes and
cache invalidation.

Wrong passphrase produces ``InvalidToken`` from Fernet's MAC check, mapped to
``BundleError("wrong passphrase or corrupted file")`` so error responses don't
reveal which failed.
"""

import base64
import os

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

BUNDLE_VERSION = 1
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SALT_BYTES = 16
_KEY_LEN = 32

# Canonical (N, r, p) per bundle version. import_bundle refuses anything not
# listed here even if otherwise well-formed, so a malicious bundle cannot
# force an arbitrary scrypt allocation (e.g. N=2^30 → ~256 GB). Adding a new
# entry is part of a deliberate version bump, never attacker-driven.
_CANONICAL_PARAMS: dict[int, tuple[int, int, int]] = {
    BUNDLE_VERSION: (_SCRYPT_N, _SCRYPT_R, _SCRYPT_P),
}


class BundleError(Exception):
    """Raised when a bundle is malformed, unsupported, or won't decrypt."""


def _derive_fernet_key(passphrase: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    """scrypt-derived 32-byte key → urlsafe-base64 (Fernet-compatible)."""
    kdf = Scrypt(salt=salt, length=_KEY_LEN, n=n, r=r, p=p)
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode()))


def export_bundle(master_key: str, passphrase: str) -> dict:
    """Wrap ``master_key`` under a fresh passphrase-derived Fernet.

    Returns the JSON-serializable envelope. The salt is randomized per call so
    two exports of the same key under the same passphrase produce distinct
    ciphertexts.
    """
    if not passphrase:
        raise BundleError("passphrase required")
    salt = os.urandom(_SALT_BYTES)
    fernet = Fernet(_derive_fernet_key(passphrase, salt, _SCRYPT_N, _SCRYPT_R, _SCRYPT_P))
    return {
        "version": BUNDLE_VERSION,
        "kdf": "scrypt",
        "salt": base64.b64encode(salt).decode(),
        "params": {"N": _SCRYPT_N, "r": _SCRYPT_R, "p": _SCRYPT_P},
        "ciphertext": fernet.encrypt(master_key.encode()).decode(),
    }


def import_bundle(bundle: dict, passphrase: str) -> str:
    """Validate and unwrap a bundle, returning the master key string.

    Raises ``BundleError`` for any malformed input, unknown version/kdf, or
    wrong passphrase. The wrong-passphrase and corrupted-file messages are
    deliberately identical to avoid an oracle.
    """
    if not passphrase:
        raise BundleError("passphrase required")
    if not isinstance(bundle, dict):
        raise BundleError("bundle must be a JSON object")
    if bundle.get("version") != BUNDLE_VERSION:
        raise BundleError(f"unsupported bundle version: {bundle.get('version')!r}")
    if bundle.get("kdf") != "scrypt":
        raise BundleError(f"unsupported kdf: {bundle.get('kdf')!r}")

    try:
        salt = base64.b64decode(bundle["salt"], validate=True)
        params = bundle["params"]
        n, r, p = int(params["N"]), int(params["r"]), int(params["p"])
        ciphertext = str(bundle["ciphertext"]).encode()
    except (KeyError, TypeError, ValueError) as exc:
        raise BundleError(f"malformed bundle: {exc}") from exc

    # Defense-in-depth: even well-formed params must match a known canonical
    # tuple for this bundle version. Prevents a malicious bundle from forcing
    # a pathological scrypt allocation (e.g. N=2^30) that the version gate
    # alone wouldn't catch.
    expected = _CANONICAL_PARAMS.get(BUNDLE_VERSION)
    if expected is None or (n, r, p) != expected:
        raise BundleError(f"unsupported scrypt params for version {bundle.get('version')!r}")

    try:
        fernet = Fernet(_derive_fernet_key(passphrase, salt, n, r, p))
        return fernet.decrypt(ciphertext).decode()
    except InvalidToken as exc:
        raise BundleError("wrong passphrase or corrupted file") from exc
