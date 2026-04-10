"""Tests for soft-delete behaviour and sync tombstone visibility."""

import pytest

SAMPLE = {
    "title": "Soft Delete Test",
    "content": "Test content for deletion.",
    "category": "Test",
    "isFavorite": False,
    "tags": [],
}


def create_prompt(client, data=None):
    r = client.post("/api/v1/prompts", json=data or SAMPLE)
    assert r.status_code == 201
    return r.json()["data"]


# ── Soft-delete behaviour ─────────────────────────────────────────────────────

def test_delete_hides_prompt_from_list(client):
    """DELETEing a prompt should exclude it from the default list."""
    prompt = create_prompt(client)
    r = client.delete(f"/api/v1/prompts/{prompt['id']}")
    assert r.status_code == 200
    assert r.json()["success"] is True

    prompts = client.get("/api/v1/prompts").json()["data"]
    ids = [p["id"] for p in prompts]
    assert prompt["id"] not in ids


def test_delete_hides_prompt_from_get(client):
    """DELETEd prompt should return 404 on direct GET."""
    prompt = create_prompt(client)
    client.delete(f"/api/v1/prompts/{prompt['id']}")

    r = client.get(f"/api/v1/prompts/{prompt['id']}")
    assert r.status_code == 404


def test_include_deleted_surfaces_tombstone(client):
    """include_deleted=true should return soft-deleted prompts with deletedAt set."""
    prompt = create_prompt(client)
    client.delete(f"/api/v1/prompts/{prompt['id']}")

    r = client.get("/api/v1/prompts?include_deleted=true")
    assert r.status_code == 200
    data = r.json()["data"]
    deleted = [p for p in data if p["id"] == prompt["id"]]
    assert len(deleted) == 1
    assert deleted[0]["deletedAt"] is not None


def test_include_deleted_false_hides_tombstone(client):
    """Default (include_deleted=false) should never return soft-deleted prompts."""
    prompt = create_prompt(client)
    client.delete(f"/api/v1/prompts/{prompt['id']}")

    r = client.get("/api/v1/prompts?include_deleted=false")
    ids = [p["id"] for p in r.json()["data"]]
    assert prompt["id"] not in ids


def test_delete_idempotent(client):
    """DELETEing an already-deleted prompt returns 404 (no double-soft-delete)."""
    prompt = create_prompt(client)
    client.delete(f"/api/v1/prompts/{prompt['id']}")
    r = client.delete(f"/api/v1/prompts/{prompt['id']}")
    assert r.status_code == 404


def test_live_prompts_not_affected_by_include_deleted(client):
    """include_deleted=true includes both live and deleted prompts."""
    live = create_prompt(client, {**SAMPLE, "title": "Live"})
    deleted = create_prompt(client, {**SAMPLE, "title": "Deleted"})
    client.delete(f"/api/v1/prompts/{deleted['id']}")

    all_ids = [p["id"] for p in client.get("/api/v1/prompts?include_deleted=true").json()["data"]]
    assert live["id"] in all_ids
    assert deleted["id"] in all_ids


def test_response_includes_timestamps(client):
    """PromptResponse should include createdAt, updatedAt, deletedAt fields for sync."""
    prompt = create_prompt(client)
    data = client.get(f"/api/v1/prompts/{prompt['id']}").json()["data"]
    assert "createdAt" in data
    assert "updatedAt" in data
    assert "deletedAt" in data
    assert data["deletedAt"] is None  # not deleted yet
