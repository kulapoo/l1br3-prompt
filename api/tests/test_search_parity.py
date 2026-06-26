"""Search-parity harness: FTS5 (SQLite) ↔ tsvector (Postgres) recall.

The single most important risk in M2 (per the plan) is recall drift between
SQLite FTS5 and Postgres tsvector due to tokenizer/dictionary differences. This
harness seeds an identical ASCII corpus into both engines and asserts:

  * **Recall ≥ 95%** in both directions across a varied query set — tolerates
    ranking/edge-tokenization differences (the threshold is the PRD's "<1%
    migration failures" analogue for search, loosened slightly to 95% to absorb
    benign tokenizer drift). Documented inline.
  * **100% exact-set parity on exact-substring queries** (the high-confidence
    subset) — hard parity where the tokenizers are expected to agree.

Gated on ``L1BR3_PG_TEST_URL`` (skips cleanly otherwise). The SQLite side is an
in-memory engine built inline; the PG side is the shared ``pg_session`` fixture.
"""

from sqlalchemy import text
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.engines.sqlite import SqliteEngine

# ── Shared corpus: ≥20 prompts spanning the parity-relevant cases ───────────
# Cases covered: exact-substring, multi-word, title-only, content-only,
# no-match, punctuation-adjacent. Kept ASCII + unstemmed to minimize tokenizer
# divergence ('simple' dictionary on PG mirrors FTS5 unicode61 for ASCII).
CORPUS = [
    ("p01", "Python debugging", "Use pdb to step through python code"),
    ("p02", "Email response", "Dear customer, thanks for your inquiry"),
    ("p03", "Git rebase guide", "Rewrite commit history safely"),
    ("p04", "SQL optimization", "Add indexes to speed up queries"),
    ("p05", "React hooks", "useState and useEffect for state management"),
    ("p06", "Docker compose", "Multi-container orchestration with compose"),
    ("p07", "REST API design", "Resource naming and status codes"),
    ("p08", "Testing strategies", "Unit integration and end to end tests"),
    ("p09", "Kubernetes deploy", "Rolling updates and rollbacks"),
    ("p10", "CSS layout", "Flexbox and grid for responsive design"),
    ("p11", "TypeScript tips", "Strict null checks and generics"),
    ("p12", "Linux permissions", "Chmod and chown for access control"),
    ("p13", "Markdown cheatsheet", "Headers lists and code blocks"),
    ("p14", "CI pipeline", "Automated builds on every push"),
    ("p15", "Database migrations", "Version controlled schema evolution"),
    ("p16", "Async programming", "Event loop and coroutines explained"),
    ("p17", "Security headers", "CSP and HSTS for web safety"),
    ("p18", "Performance profiling", "Find bottlenecks with flame graphs"),
    ("p19", "Networking basics", "TCP UDP and the three way handshake"),
    ("p20", "Code review", "Constructive feedback for teammates"),
    ("p21", "Memory management", "Garbage collection and references"),
    ("p22", "Error handling", "Try except and custom exceptions"),
]

# Queries split into the hard-parity subset (exact substring of a token) and the
# broader recall subset. Hard-parity queries must match the identical ID set on
# both engines; recall queries must overlap ≥ PARITY_THRESHOLD.
HARD_PARITY_QUERIES = ["python", "debugging", "docker", "kubernetes", "typescript", "kubernetes deploy"]

RECALL_QUERIES = [
    "python",
    "customer email",
    "git rebase",
    "sql queries",
    "hooks",
    "compose",
    "api design",
    "testing",
    "rolling updates",
    "flexbox",
    "strict null",
    "chmod",
    "markdown",
    "automated builds",
    "schema",
    "coroutines",
    "security",
    "profiling",
    "handshake",
    "code review",
    "garbage collection",
    "exceptions",
    "zzznomatchzzz",
]

PARITY_THRESHOLD = 0.95


def _recall(a: set[str], b: set[str]) -> float:
    """Fraction of ``b``'s matches that ``a`` also finds (0.0 if b is empty)."""
    if not b:
        return 1.0
    return len(a & b) / len(b)


def _build_sqlite_engine():
    eng = SqliteEngine("sqlite:///:memory:", poolclass=StaticPool)
    Base.metadata.create_all(bind=eng.engine)
    with eng.engine.connect() as conn:
        eng.search.init(conn)
        conn.commit()
    return eng


def _seed_sqlite(eng, corpus):
    session = eng.SessionLocal()
    try:
        for pid, title, content in corpus:
            session.execute(
                text(
                    "INSERT INTO prompts (id, title, content, category, usage_count, is_favorite, created_at, updated_at) "
                    "VALUES (:id, :title, :content, 'General', 0, 0, '2024-01-01', '2024-01-01')"
                ),
                {"id": pid, "title": title, "content": content},
            )
        session.commit()
        return session
    except Exception:
        session.close()
        raise


def _seed_pg(session, corpus):
    for pid, title, content in corpus:
        session.execute(
            text(
                "INSERT INTO prompts (id, title, content, category, usage_count, is_favorite, created_at, updated_at) "
                "VALUES (:id, :title, :content, 'General', 0, false, now(), now())"
            ),
            {"id": pid, "title": title, "content": content},
        )
    session.flush()


def test_hard_parity_exact_substring_queries(pg_engine, pg_session):
    # Exact-substring queries: FTS5 and tsvector must agree exactly (zero false
    # negatives on the high-confidence subset — the plan's hard-parity bar).
    sqlite_eng = _build_sqlite_engine()
    sqlite_session = _seed_sqlite(sqlite_eng, CORPUS)
    try:
        _seed_pg(pg_session, CORPUS)
        failures = []
        for q in HARD_PARITY_QUERIES:
            sqlite_ids = set(sqlite_eng.search.search_prompts(sqlite_session, q))
            pg_ids = set(pg_engine.search.search_prompts(pg_session, q))
            if sqlite_ids != pg_ids:
                failures.append((q, sqlite_ids, pg_ids))
        assert not failures, f"hard-parity mismatches: {failures}"
    finally:
        sqlite_session.close()
        Base.metadata.drop_all(bind=sqlite_eng.engine)


def test_recall_at_least_95_percent_both_directions(pg_engine, pg_session):
    # Recall parity: tolerate ranking/edge-tokenization drift, but ≥95% of either
    # engine's matches must be found by the other.
    sqlite_eng = _build_sqlite_engine()
    sqlite_session = _seed_sqlite(sqlite_eng, CORPUS)
    try:
        _seed_pg(pg_session, CORPUS)
        below = []
        for q in RECALL_QUERIES:
            sqlite_ids = set(sqlite_eng.search.search_prompts(sqlite_session, q))
            pg_ids = set(pg_engine.search.search_prompts(pg_session, q))
            r_pg_of_sqlite = _recall(pg_ids, sqlite_ids)
            r_sqlite_of_pg = _recall(sqlite_ids, pg_ids)
            if r_pg_of_sqlite < PARITY_THRESHOLD or r_sqlite_of_pg < PARITY_THRESHOLD:
                below.append((q, sqlite_ids, pg_ids, r_pg_of_sqlite, r_sqlite_of_pg))
        assert not below, (
            f"recall below {PARITY_THRESHOLD:.0%} threshold: {below}"
            " — if drift is a tokenizer stem, flip SEARCH_DICTIONARY to 'english' in "
            "app.db.engines.postgres and re-measure."
        )
    finally:
        sqlite_session.close()
        Base.metadata.drop_all(bind=sqlite_eng.engine)
