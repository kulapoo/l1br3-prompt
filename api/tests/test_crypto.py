"""Unit tests for the Fernet-based at-rest encryption used by ai_providers.

Covers: round-trip, tamper detection, wrong-master-key failure, and the
get_master_key() env/file resolution.
"""


import pytest
from cryptography.fernet import InvalidToken

from app.services.security.crypto import decrypt, encrypt


def test_encrypt_decrypt_round_trip():
    plaintext = "sk-secret-openai-key-12345"
    token = encrypt(plaintext)
    assert isinstance(token, bytes)
    assert plaintext.encode() not in token
    assert decrypt(token) == plaintext


def test_encrypt_is_non_deterministic():
    a = encrypt("same-key")
    b = encrypt("same-key")
    assert a != b
    assert decrypt(a) == decrypt(b) == "same-key"


def test_decrypt_tampered_token_raises():
    token = bytearray(encrypt("hello"))
    token[0] ^= 0xFF
    with pytest.raises(InvalidToken):
        decrypt(bytes(token))


def test_decrypt_with_wrong_master_key_raises(monkeypatch, tmp_path):
    from app import config as config_module
    from app.services.security import crypto as crypto_module

    monkeypatch.setenv("L1BR3_MASTER_KEY", _gen_key())
    monkeypatch.setattr(config_module, "_cached_master_key", None)
    monkeypatch.setattr(crypto_module, "_fernet", None)
    token = encrypt("secret")

    monkeypatch.setenv("L1BR3_MASTER_KEY", _gen_key())
    monkeypatch.setattr(config_module, "_cached_master_key", None)
    monkeypatch.setattr(crypto_module, "_fernet", None)

    with pytest.raises(InvalidToken):
        decrypt(token)


def test_get_master_key_from_env(monkeypatch, tmp_path):
    key = _gen_key()
    monkeypatch.setenv("L1BR3_MASTER_KEY", key)
    monkeypatch.setattr("app.config._cached_master_key", None)
    from app.config import get_master_key

    assert get_master_key() == key


def test_get_master_key_auto_generates_file(monkeypatch, tmp_path):
    monkeypatch.delenv("L1BR3_MASTER_KEY", raising=False)
    key_file = tmp_path / "master.key"
    monkeypatch.setattr("app.config.DEFAULT_MASTER_KEY_PATH", key_file)
    monkeypatch.setattr("app.config._cached_master_key", None)
    from app.config import get_master_key

    key = get_master_key()
    assert key_file.exists()
    assert key_file.read_text() == key
    stat = key_file.stat()
    assert (stat.st_mode & 0o777) == 0o600
    monkeypatch.setattr("app.config._cached_master_key", None)
    assert get_master_key() == key


def _gen_key() -> str:
    from cryptography.fernet import Fernet

    return Fernet.generate_key().decode()
