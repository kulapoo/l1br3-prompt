import pytest


def create_prompt(client, title, content, category="General", tags=None, is_favorite=False):
    payload = {
        "title": title,
        "content": content,
        "category": category,
        "isFavorite": is_favorite,
        "tags": tags or [],
    }
    r = client.post("/api/v1/prompts", json=payload)
    assert r.status_code == 201
    return r.json()["data"]


def suggest(client, **ctx):
    r = client.post("/api/v1/suggest", json=ctx)
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    return body["data"]


# ── Empty context ─────────────────────────────────────────────────────────────

def test_empty_context_no_prompts(client):
    results = suggest(client)
    assert results == []


def test_empty_context_with_prompts(client):
    create_prompt(client, "Some Prompt", "Some content")
    results = suggest(client)
    assert results == []


# ── URL pattern matching ──────────────────────────────────────────────────────

def test_github_pr_url_matches_code_review_prompts(client):
    code_review = create_prompt(
        client, "Code Review", "Review {{code}} for issues",
        category="Code", tags=[{"name": "Review"}]
    )
    create_prompt(client, "Email Template", "Dear {{name}}", tags=[{"name": "Email"}])

    results = suggest(client, url="https://github.com/owner/repo/pull/42")
    ids = [r["promptId"] for r in results]
    assert code_review["id"] in ids
    assert all(r["rule"] == "url_pattern" for r in results if r["promptId"] == code_review["id"])


def test_github_general_url_matches_code_prompts(client):
    code_prompt = create_prompt(
        client, "Generate Tests", "Write tests for {{code}}",
        category="Code", tags=[{"name": "Code"}]
    )
    email_prompt = create_prompt(client, "Email Draft", "Write email", tags=[{"name": "Email"}])

    results = suggest(client, url="https://github.com/owner/repo")
    ids = [r["promptId"] for r in results]
    assert code_prompt["id"] in ids
    assert email_prompt["id"] not in ids


def test_email_url_matches_email_prompts(client):
    email_prompt = create_prompt(
        client, "Professional Email", "Write email for {{topic}}",
        tags=[{"name": "Email"}]
    )
    code_prompt = create_prompt(client, "Debug Code", "Debug {{code}}", tags=[{"name": "Code"}])

    results = suggest(client, url="https://mail.google.com/mail/u/0/#inbox")
    ids = [r["promptId"] for r in results]
    assert email_prompt["id"] in ids
    assert code_prompt["id"] not in ids


# ── Selected text rule ────────────────────────────────────────────────────────

def test_code_input_prefers_code_prompts_with_placeholders(client):
    code_prompt = create_prompt(
        client, "Code Review", "Review {{code}} carefully",
        category="Code", tags=[{"name": "Code"}]
    )
    plain_prompt = create_prompt(client, "Summarize Text", "Summarize the following")

    code_snippet = "function calculateTotal(items) { return items.reduce((a, b) => a + b, 0); }"
    results = suggest(client, selectedText=code_snippet)

    ids = [r["promptId"] for r in results]
    assert code_prompt["id"] in ids

    # Code prompt with placeholder should score higher than plain prompt
    code_score = next(r["score"] for r in results if r["promptId"] == code_prompt["id"])
    if plain_prompt["id"] in ids:
        plain_score = next(r["score"] for r in results if r["promptId"] == plain_prompt["id"])
        assert code_score >= plain_score


def test_short_selected_text_ignored(client):
    create_prompt(client, "Any Prompt", "Content {{var}}", tags=[{"name": "Code"}])
    results = suggest(client, selectedText="hi")
    assert results == []


# ── Keyword match rule ────────────────────────────────────────────────────────

def test_keyword_match_via_input_text(client):
    debug_prompt = create_prompt(
        client, "Python Debugging Tips", "Use pdb to debug Python code"
    )
    email_prompt = create_prompt(client, "Email Template", "Dear customer")

    results = suggest(client, inputText="python")
    ids = [r["promptId"] for r in results]
    assert debug_prompt["id"] in ids
    assert email_prompt["id"] not in ids


def test_keyword_match_via_page_title(client):
    prompt = create_prompt(client, "Pull Request Checklist", "Check {{pr}} for issues")
    create_prompt(client, "Email Reply", "Reply to email")

    results = suggest(client, pageTitle="Pull Request Review")
    ids = [r["promptId"] for r in results]
    assert prompt["id"] in ids


# ── Boost rules ───────────────────────────────────────────────────────────────

def test_favorite_boost_raises_score(client):
    base = create_prompt(
        client, "Regular Code Prompt", "Review {{code}}",
        category="Code", tags=[{"name": "Code"}]
    )
    favorite = create_prompt(
        client, "Favorite Code Prompt", "Improve {{code}}",
        category="Code", tags=[{"name": "Code"}], is_favorite=True
    )

    results = suggest(client, url="https://github.com/owner/repo")
    ids = [r["promptId"] for r in results]
    assert base["id"] in ids
    assert favorite["id"] in ids

    base_score = next(r["score"] for r in results if r["promptId"] == base["id"])
    fav_score = next(r["score"] for r in results if r["promptId"] == favorite["id"])
    assert fav_score > base_score


# ── Response structure ────────────────────────────────────────────────────────

def test_suggestion_response_fields(client):
    create_prompt(
        client, "Code Review", "Review {{code}}", category="Code", tags=[{"name": "Code"}]
    )

    results = suggest(client, url="https://github.com/owner/repo/pull/1")
    assert len(results) >= 1

    s = results[0]
    assert "id" in s
    assert "promptId" in s
    assert "title" in s
    assert "description" in s
    assert "actionText" in s
    assert "score" in s
    assert "rule" in s
    assert s["score"] > 0


def test_results_sorted_by_score_descending(client):
    for i in range(3):
        create_prompt(
            client, f"Code Prompt {i}", f"Review {{{{code{i}}}}}",
            category="Code", tags=[{"name": "Code"}]
        )

    results = suggest(client, url="https://github.com/owner/repo/pull/1")
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)


def test_results_capped_at_10(client):
    for i in range(15):
        create_prompt(
            client, f"Code Prompt {i}", "Review {{code}}",
            category="Code", tags=[{"name": "Code"}]
        )

    results = suggest(client, url="https://github.com/owner/repo/pull/1")
    assert len(results) <= 10


# ── AI opt-in (useAi flag) ────────────────────────────────────────────────────


def test_use_ai_false_skips_provider(client):
    """useAi=False must return rule-based results without touching Ollama."""
    create_prompt(client, "Code Review", "Review {{code}}", category="Code", tags=[{"name": "Code"}])
    # No httpx mock needed — provider is never instantiated when useAi=False
    results = suggest(client, url="https://github.com/owner/repo/pull/1", useAi=False)
    assert len(results) >= 1
    assert all(r["rule"] != "ai_enhanced" for r in results)


def test_use_ai_true_falls_back_gracefully_when_ollama_down(client, httpx_mock):
    """When Ollama is unreachable, useAi=True must still return rule-based results."""
    from pytest_httpx import HTTPXMock
    import httpx as _httpx

    httpx_mock.add_exception(_httpx.ConnectError("refused"), url="http://127.0.0.1:11434/api/tags")

    create_prompt(client, "Code Review", "Review {{code}}", category="Code", tags=[{"name": "Code"}])
    r = client.post("/api/v1/suggest", json={"url": "https://github.com/owner/repo/pull/1", "useAi": True})
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    # Results still come back — graceful degradation
    assert isinstance(body["data"], list)
