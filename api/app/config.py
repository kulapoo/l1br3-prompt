"""Master key resolution for at-rest encryption.

Precedence: ``L1BR3_MASTER_KEY`` env var > auto-generated ``~/.l1br3/master.key``
(0600). The resolved key is cached in a module global for the process lifetime;
tests clear the cache via monkeypatching ``_cached_master_key`` to ``None``.

Key loss is recoverable by re-entering provider keys (acceptable for a
127.0.0.1-bound local app); a wrong/rotated key surfaces as an explicit 503 at
the provider-service boundary rather than a silent decrypt failure.
"""

import os
from pathlib import Path

DEFAULT_MASTER_KEY_PATH = Path.home() / ".l1br3" / "master.key"

_cached_master_key: str | None = None


def get_master_key() -> str:
    """Return the Fernet master key, generating/persisting one on first use."""
    global _cached_master_key
    if _cached_master_key is not None:
        return _cached_master_key

    env_key = os.environ.get("L1BR3_MASTER_KEY")
    if env_key:
        _cached_master_key = env_key.strip()
        return _cached_master_key

    path = DEFAULT_MASTER_KEY_PATH
    if path.exists():
        _cached_master_key = path.read_text().strip()
        return _cached_master_key

    from cryptography.fernet import Fernet

    key = Fernet.generate_key().decode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(key)
    try:
        path.chmod(0o600)
    except OSError:
        pass
    _cached_master_key = key
    return _cached_master_key
