"""Integration tests for tsvector ``search_prompts`` against a live PostgreSQL.

Gated on ``L1BR3_PG_TEST_URL`` via the ``pg_session`` fixture — the whole module
``pytest.skip``s without it, so the default gate stays SQLite-only.

Covers the ``_PostgresTsVectorSearch.search_prompts`` contract: which IDs match,
title-over-content weighting, multi-word queries, punctuation tolerance, and the
no-match case. Ordering is asserted softly (title-ranked-above-content) rather
than as an exact sequence, since ``ts_rank_cd`` is not byte-identical to FTS5's
``rank``.
"""

from sqlalchemy import text

INSERT_SQL = (
    "INSERT INTO prompts (id, title, content, category, usage_count, is_favorite, created_at, updated_at) "
    "VALUES (:id, :title, :content, 'General', 0, false, now(), now())"
)


def _seed(session, rows):
    for r in rows:
        session.execute(text(INSERT_SQL), r)
    session.flush()


def _search(pg_engine, session, query):
    return pg_engine.search.search_prompts(session, query)


def test_exact_word_in_content_matches(pg_engine, pg_session):
    _seed(
        pg_session,
        [
            {"id": "a1", "title": "Notes", "content": "Deploy with kubernetes and helm"},
            {"id": "a2", "title": "Other", "content": "Nothing relevant here"},
        ],
    )
    assert _search(pg_engine, pg_session, "kubernetes") == ["a1"]


def test_no_match_returns_empty(pg_engine, pg_session):
    _seed(pg_session, [{"id": "b1", "title": "Hello", "content": "World"}])
    assert _search(pg_engine, pg_session, "zzznopezzz") == []


def test_title_match_ranks_above_content_match(pg_engine, pg_session):
    # 'python' appears in a2's title (weight A) and a1's content (weight B).
    # ts_rank_cd must order the title hit first.
    _seed(
        pg_session,
        [
            {"id": "c1", "title": "Generic guide", "content": "Learn python the easy way"},
            {"id": "c2", "title": "Python debugging", "content": "Use pdb effectively"},
        ],
    )
    ids = _search(pg_engine, pg_session, "python")
    assert ids[0] == "c2"
    assert set(ids) == {"c1", "c2"}


def test_multi_word_query_matches(pg_engine, pg_session):
    _seed(
        pg_session,
        [
            {"id": "d1", "title": "Customer email", "content": "Draft a polite reply"},
            {"id": "d2", "title": "Recipes", "content": "Pasta carbonara recipe"},
        ],
    )
    ids = _search(pg_engine, pg_session, "customer email")
    assert "d1" in ids
    assert "d2" not in ids


def test_query_with_punctuation_does_not_raise(pg_engine, pg_session):
    # plainto_tsquery must tolerate stray punctuation (parity with FTS5 MATCH).
    _seed(pg_session, [{"id": "e1", "title": "Git rebase", "content": "Rewrite history"}])
    # Should not raise and should still find the term.
    ids = _search(pg_engine, pg_session, "git!!! rebase,")
    assert "e1" in ids
