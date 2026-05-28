from datetime import datetime, timedelta, timezone


def _create(client, **overrides):
    payload = {
        "title": "Sample",
        "content": "Body",
        "category": "General",
        "isFavorite": False,
        "tags": [],
    }
    payload.update(overrides)
    r = client.post("/api/v1/prompts", json=payload)
    assert r.status_code == 201, r.text
    return r.json()["data"]


def _set_usage(db, prompt_id, count, last_used_iso):
    from app.models.prompt import Prompt
    prompt = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    prompt.usage_count = count
    prompt.last_used = last_used_iso
    db.commit()


def test_stats_empty_db(client):
    r = client.get("/api/v1/prompts/stats")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["totalPrompts"] == 0
    assert data["totalCopies"] == 0
    assert data["favoritesCount"] == 0
    assert data["topUsed"] == []
    assert data["stale"] == []
    assert data["byCategory"] == []


def test_stats_aggregates_totals_and_favorites(client, db):
    a = _create(client, title="A")
    b = _create(client, title="B", isFavorite=True)
    c = _create(client, title="C", isFavorite=True)
    _set_usage(db, a["id"], 3, datetime.now(timezone.utc).isoformat())
    _set_usage(db, b["id"], 7, datetime.now(timezone.utc).isoformat())
    _set_usage(db, c["id"], 0, None)

    r = client.get("/api/v1/prompts/stats")
    data = r.json()["data"]
    assert data["totalPrompts"] == 3
    assert data["totalCopies"] == 10
    assert data["favoritesCount"] == 2


def test_stats_top_used_ordered_and_limited(client, db):
    ids = []
    for i in range(7):
        p = _create(client, title=f"P{i}")
        _set_usage(db, p["id"], i + 1, datetime.now(timezone.utc).isoformat())
        ids.append((p["id"], i + 1))

    r = client.get("/api/v1/prompts/stats")
    top = r.json()["data"]["topUsed"]
    assert len(top) == 5
    counts = [t["usageCount"] for t in top]
    assert counts == sorted(counts, reverse=True)
    assert counts[0] == 7


def test_stats_stale_includes_never_used_and_30d_plus(client, db):
    fresh = _create(client, title="Fresh")
    old = _create(client, title="Old")
    never = _create(client, title="Never")

    now = datetime.now(timezone.utc)
    _set_usage(db, fresh["id"], 5, now.isoformat())
    _set_usage(db, old["id"], 2, (now - timedelta(days=45)).isoformat())
    _set_usage(db, never["id"], 0, None)

    r = client.get("/api/v1/prompts/stats")
    stale = r.json()["data"]["stale"]
    titles = {s["title"] for s in stale}
    assert "Old" in titles
    assert "Never" in titles
    assert "Fresh" not in titles


def test_stats_excludes_soft_deleted(client, db):
    a = _create(client, title="Keep")
    b = _create(client, title="Gone", isFavorite=True)
    _set_usage(db, a["id"], 4, datetime.now(timezone.utc).isoformat())
    _set_usage(db, b["id"], 10, datetime.now(timezone.utc).isoformat())

    # Soft-delete b
    r = client.delete(f"/api/v1/prompts/{b['id']}")
    assert r.status_code == 200

    r = client.get("/api/v1/prompts/stats")
    data = r.json()["data"]
    assert data["totalPrompts"] == 1
    assert data["totalCopies"] == 4
    assert data["favoritesCount"] == 0
    assert all(t["title"] != "Gone" for t in data["topUsed"])


def test_stats_by_category_groups_and_sorts(client, db):
    _create(client, title="A", category="Code")
    _create(client, title="B", category="Code")
    _create(client, title="C", category="Code")
    _create(client, title="D", category="Writing")

    r = client.get("/api/v1/prompts/stats")
    by_cat = r.json()["data"]["byCategory"]
    counts = {c["category"]: c["count"] for c in by_cat}
    assert counts["Code"] == 3
    assert counts["Writing"] == 1
    # Sorted desc by count
    assert by_cat[0]["count"] >= by_cat[-1]["count"]


def test_stats_route_precedes_id_route(client):
    """Regression: GET /prompts/stats must hit the stats handler, not /{id}."""
    r = client.get("/api/v1/prompts/stats")
    assert r.status_code == 200
    # If misordered, this would 404 (no prompt with id="stats").
    assert "totalPrompts" in r.json()["data"]
