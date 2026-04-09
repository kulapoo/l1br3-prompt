def test_categories_empty(client):
    response = client.get("/api/v1/categories")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == []


def test_categories_after_prompts(client):
    client.post("/api/v1/prompts", json={"title": "A", "content": "x", "category": "Writing"})
    client.post("/api/v1/prompts", json={"title": "B", "content": "y", "category": "Code"})
    client.post("/api/v1/prompts", json={"title": "C", "content": "z", "category": "Writing"})

    response = client.get("/api/v1/categories")
    assert response.status_code == 200
    categories = response.json()["data"]
    assert sorted(categories) == ["Code", "Writing"]
