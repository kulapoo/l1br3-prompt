"""Integration tests for /api/v1/providers — encrypted BYOK key storage.

Critical guarantees:
  - GET never returns the plaintext or ciphertext key.
  - PATCH with a new key updates the ciphertext (key rotation).
  - ``has_key`` reflects whether a key is stored.
"""

SECRET_KEY = "sk-secret-provider-key-99999"


def _create(client, *, type="openai", base_url=None, api_key=SECRET_KEY):
    body = {"type": type, "apiKey": api_key}
    if base_url is not None:
        body["baseUrl"] = base_url
    r = client.post("/api/v1/providers", json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]


def test_create_provider_returns_has_key_true_without_key(client):
    p = _create(client)
    assert p["type"] == "openai"
    assert p["hasKey"] is True
    assert "apiKey" not in p
    assert "encryptedApiKey" not in p


def test_get_list_never_exposes_key_material(client):
    _create(client, api_key=SECRET_KEY)
    r = client.get("/api/v1/providers")
    assert r.status_code == 200
    body = r.text
    assert SECRET_KEY not in body
    assert "apiKey" not in r.json()["data"][0]
    assert "encryptedApiKey" not in r.json()["data"][0]
    assert r.json()["data"][0]["hasKey"] is True


def test_get_one_never_exposes_key_material(client):
    p = _create(client)
    r = client.get(f"/api/v1/providers/{p['id']}")
    assert r.status_code == 200
    assert SECRET_KEY not in r.text
    assert "apiKey" not in r.json()["data"]
    assert r.json()["data"]["hasKey"] is True


def test_patch_rotates_key(client):
    p = _create(client, api_key="sk-old")
    new_key = "sk-rotated-12345"
    r = client.patch(f"/api/v1/providers/{p['id']}", json={"apiKey": new_key})
    assert r.status_code == 200
    assert new_key not in r.text
    assert r.json()["data"]["hasKey"] is True


def test_patch_updates_base_url(client):
    p = _create(client, base_url="http://old:1234/v1")
    r = client.patch(f"/api/v1/providers/{p['id']}", json={"baseUrl": "http://new:5678/v1"})
    assert r.status_code == 200
    assert r.json()["data"]["baseUrl"] == "http://new:5678/v1"


def test_delete_provider(client):
    p = _create(client)
    r = client.delete(f"/api/v1/providers/{p['id']}")
    assert r.status_code == 200
    r = client.get(f"/api/v1/providers/{p['id']}")
    assert r.status_code == 404


def test_create_rejects_missing_key(client):
    r = client.post("/api/v1/providers", json={"type": "openai"})
    assert r.status_code == 422


def test_get_unknown_provider_returns_404(client):
    r = client.get("/api/v1/providers/does-not-exist")
    assert r.status_code == 404


def test_encrypted_at_rest(db):
    """The DB column holds ciphertext, not the plaintext key."""
    from app.models.ai_provider import AIProviderModel
    from app.repositories.provider_repo import ProviderRepository
    from app.services.security.crypto import encrypt

    repo = ProviderRepository(db)
    model = repo.create(type_="openai", base_url=None, encrypted_api_key=encrypt(SECRET_KEY))
    db.commit()
    db.refresh(model)
    stored = db.get(AIProviderModel, model.id)
    assert stored is not None
    assert SECRET_KEY.encode() not in stored.encrypted_api_key
    assert stored.encrypted_api_key != SECRET_KEY.encode()
