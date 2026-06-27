"""Fernet symmetric encryption for secrets at rest.

``encrypt``/``decrypt`` are the only public surface. The Fernet instance is
lazily built from ``app.config.get_master_key()`` so a missing key file is only
fatal when encryption is actually requested.
"""

from cryptography.fernet import Fernet

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        from app.config import get_master_key

        _fernet = Fernet(get_master_key().encode())
    return _fernet


def encrypt(plaintext: str) -> bytes:
    return _get_fernet().encrypt(plaintext.encode())


def decrypt(token: bytes) -> str:
    return _get_fernet().decrypt(token).decode()


def clear_fernet_cache() -> None:
    """Reset the cached Fernet so the next call rebuilds it from the (possibly
    rotated) master key. Called by the master-key import route.
    """
    global _fernet
    _fernet = None
