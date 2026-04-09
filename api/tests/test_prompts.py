import pytest


SAMPLE = {
    "title": "Code Review Prompt",
    "content": "Review {{code}} for bugs and suggest improvements.",
    "category": "Code",
    "isFavorite": False,
    "tags": [{"name": "Review", "color": "#FF5733"}],
}


def create_prompt(client, data=None):
    payload = data or SAMPLE
    r = client.post("/api/v1/prompts", json=payload)
    assert r.status_code == 201
    return r.json()["data"]


# ── CRUD ──────────────────────────────────────────────────────────────────────

def test_create_prompt(client):
    data = create_prompt(client)
    assert data["title"] == SAMPLE["title"]
    assert data["content"] == SAMPLE["content"]
    assert data["category"] == SAMPLE["category"]
    assert data["usageCount"] == 0
    assert data["isFavorite"] is False
    assert len(data["tags"]) == 1
    assert data["tags"][0]["name"] == "Review"


def test_get_prompt(client):
    created = create_prompt(client)
    r = client.get(f"/api/v1/prompts/{created['id']}")
    assert r.status_code == 200
    assert r.json()["data"]["id"] == created["id"]


def test_get_prompt_not_found(client):
    r = client.get("/api/v1/prompts/nonexistent-id")
    assert r.status_code == 404


def test_list_prompts(client):
    create_prompt(client)
    create_prompt(client, {**SAMPLE, "title": "Another"})
    r = client.get("/api/v1/prompts")
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 2
    assert body["metadata"]["total"] == 2


def test_update_prompt(client):
    created = create_prompt(client)
    r = client.put(
        f"/api/v1/prompts/{created['id']}",
        json={"title": "Updated Title", "isFavorite": True},
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["title"] == "Updated Title"
    assert data["isFavorite"] is True


def test_update_prompt_not_found(client):
    r = client.put("/api/v1/prompts/bad-id", json={"title": "x"})
    assert r.status_code == 404


def test_delete_prompt(client):
    created = create_prompt(client)
    r = client.delete(f"/api/v1/prompts/{created['id']}")
    assert r.status_code == 200
    assert r.json()["success"] is True

    r2 = client.get(f"/api/v1/prompts/{created['id']}")
    assert r2.status_code == 404


def test_delete_prompt_not_found(client):
    r = client.delete("/api/v1/prompts/bad-id")
    assert r.status_code == 404


# ── Usage / Copy ──────────────────────────────────────────────────────────────

def test_copy_increments_usage(client):
    created = create_prompt(client)
    assert created["usageCount"] == 0

    r = client.post(f"/api/v1/prompts/{created['id']}/copy")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["usageCount"] == 1
    assert data["lastUsed"] is not None

    r2 = client.post(f"/api/v1/prompts/{created['id']}/copy")
    assert r2.json()["data"]["usageCount"] == 2


def test_copy_not_found(client):
    r = client.post("/api/v1/prompts/bad-id/copy")
    assert r.status_code == 404


# ── Tags ──────────────────────────────────────────────────────────────────────

def test_add_tags(client):
    created = create_prompt(client, {**SAMPLE, "tags": []})
    assert len(created["tags"]) == 0

    r = client.post(
        f"/api/v1/prompts/{created['id']}/tags",
        json=[{"name": "Debug"}, {"name": "Code"}],
    )
    assert r.status_code == 200
    tags = r.json()["data"]["tags"]
    tag_names = {t["name"] for t in tags}
    assert "Debug" in tag_names
    assert "Code" in tag_names


def test_tags_are_shared(client):
    """Creating two prompts with the same tag name should reuse the tag."""
    p1 = create_prompt(client, {**SAMPLE, "tags": [{"name": "Shared"}]})
    p2 = create_prompt(client, {**SAMPLE, "title": "Other", "tags": [{"name": "Shared"}]})
    assert p1["tags"][0]["id"] == p2["tags"][0]["id"]


# ── Filtering ─────────────────────────────────────────────────────────────────

def test_filter_by_favorite(client):
    create_prompt(client, {**SAMPLE, "title": "A", "isFavorite": True})
    create_prompt(client, {**SAMPLE, "title": "B", "isFavorite": False})

    r = client.get("/api/v1/prompts?favorite=true")
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 1
    assert data[0]["title"] == "A"


def test_filter_by_category(client):
    create_prompt(client, {**SAMPLE, "title": "A", "category": "Writing"})
    create_prompt(client, {**SAMPLE, "title": "B", "category": "Code"})

    r = client.get("/api/v1/prompts?category=Writing")
    data = r.json()["data"]
    assert len(data) == 1
    assert data[0]["category"] == "Writing"


def test_filter_by_tag(client):
    create_prompt(client, {**SAMPLE, "title": "A", "tags": [{"name": "Alpha"}]})
    create_prompt(client, {**SAMPLE, "title": "B", "tags": [{"name": "Beta"}]})

    r = client.get("/api/v1/prompts?tag=Alpha")
    data = r.json()["data"]
    assert len(data) == 1
    assert data[0]["title"] == "A"


# ── Pagination ────────────────────────────────────────────────────────────────

def test_pagination(client):
    for i in range(5):
        create_prompt(client, {**SAMPLE, "title": f"Prompt {i}"})

    r = client.get("/api/v1/prompts?page=1&limit=2")
    body = r.json()
    assert len(body["data"]) == 2
    assert body["metadata"]["total"] == 5
    assert body["metadata"]["page"] == 1

    r2 = client.get("/api/v1/prompts?page=3&limit=2")
    assert len(r2.json()["data"]) == 1


# ── Search (FTS5) ─────────────────────────────────────────────────────────────

def test_search_prompts(client):
    create_prompt(client, {**SAMPLE, "title": "Python debugging tips", "content": "Use pdb"})
    create_prompt(client, {**SAMPLE, "title": "Email template", "content": "Dear customer"})

    r = client.get("/api/v1/prompts?search=python")
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 1
    assert "Python" in data[0]["title"]


def test_search_no_results(client):
    create_prompt(client)
    r = client.get("/api/v1/prompts?search=zzznomatch")
    assert r.status_code == 200
    assert r.json()["data"] == []
