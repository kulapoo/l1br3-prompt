"""Tests for migration_service — streaming data copy across DB engines (M4).

Guarantees:
  - ``iter_migration`` copies every row of every user-data table with byte-exact
    fidelity (prompts, tags, prompt_tags, transform_modes, ai_providers).
  - The copy runs inside ONE target transaction; any failure rolls the target
    back to empty and leaves the source untouched.
  - A populated target is refused; an empty source is a clean no-op.
  - No secret material (URL/password) ever appears in a progress event.
"""

import os
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select, text

from app.db.base import Base
from app.db.engines.base import DatabaseEngine
from app.db.engines.sqlite import SqliteEngine
from app.models.ai_provider import AIProviderModel
from app.models.prompt import Prompt, prompt_tags
from app.models.tag import Tag
from app.models.transform_mode import TransformMode

# ── helpers ──────────────────────────────────────────────────────────────────


def _make_sqlite_engine(tmp_path, name: str) -> SqliteEngine:
    """A file-backed SQLite engine with schema + FTS triggers ready (mirrors conftest's db fixture)."""
    eng = SqliteEngine(f"sqlite:///{tmp_path}/{name}.db")
    Base.metadata.create_all(bind=eng.engine)
    with eng.engine.connect() as conn:
        eng.search.init(conn)
        conn.commit()
    return eng


def _seed_source(source: DatabaseEngine) -> None:
    """Populate the source with one row per table, exercising junctions + soft-delete + ciphertext."""
    session = source.SessionLocal()
    try:
        work = Tag(name="work", color="#FF0000")
        personal = Tag(name="personal", color="#00FF00")
        session.add_all([work, personal])
        session.flush()

        p1 = Prompt(title="Alpha", content="first prompt", category="General", is_favorite=True, tags=[work])
        p2 = Prompt(title="Beta", content="second prompt", category="Writing", usage_count=5, tags=[work, personal])
        p3 = Prompt(title="Gamma", content="deleted one", category="General", tags=[personal])
        p3.deleted_at = datetime.now(UTC)
        session.add_all([p1, p2, p3])
        session.flush()

        session.add(TransformMode(name="Expand", instruction="Make it longer"))
        session.add(AIProviderModel(type="openai", base_url=None, encrypted_api_key=b"\x01\x02\x03secret"))
        session.commit()
    finally:
        session.close()


def _rows(engine: DatabaseEngine, table) -> list[dict]:
    with engine.engine.connect() as conn:
        return [dict(r) for r in conn.execute(select(table)).mappings()]


def _clear_all(engine: DatabaseEngine) -> None:
    """Delete every row from every copied table (reverse FK order). Any dialect."""
    with engine.engine.begin() as conn:
        conn.execute(delete(prompt_tags))
        conn.execute(delete(Prompt.__table__))
        conn.execute(delete(Tag.__table__))
        conn.execute(delete(TransformMode.__table__))
        conn.execute(delete(AIProviderModel.__table__))


# ── Task 2: happy path / fidelity ────────────────────────────────────────────


class TestIterMigrationHappyPath:
    def test_meta_event_first_with_dialects_and_tables(self, tmp_path):
        from app.services.migration_service import MigrationMeta, iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        events = list(iter_migration(source, target))
        assert isinstance(events[0], MigrationMeta)
        assert events[0].source_engine == "sqlite"
        assert events[0].target_engine == "sqlite"
        assert events[0].tables == ["tags", "prompts", "prompt_tags", "transform_modes", "ai_providers"]

    def test_copies_every_table_with_full_fidelity(self, tmp_path):
        from app.services.migration_service import iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        _seed_source(source)
        assert _rows(target, Prompt.__table__) == []

        list(iter_migration(source, target))

        assert len(_rows(target, Tag.__table__)) == 2
        assert len(_rows(target, Prompt.__table__)) == 3  # incl. soft-deleted Gamma
        # Junction: p1->work, p2->work, p2->personal, p3->personal
        assert len(_rows(target, prompt_tags)) == 4
        assert len(_rows(target, TransformMode.__table__)) == 1
        tgt_providers = _rows(target, AIProviderModel.__table__)
        assert len(tgt_providers) == 1
        assert tgt_providers[0]["encrypted_api_key"] == b"\x01\x02\x03secret"

    def test_prompt_row_content_matches_source(self, tmp_path):
        from app.services.migration_service import iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        _seed_source(source)
        list(iter_migration(source, target))

        assert sorted(r["title"] for r in _rows(source, Prompt.__table__)) == ["Alpha", "Beta", "Gamma"]
        by_title = {r["title"]: r for r in _rows(target, Prompt.__table__)}
        assert by_title["Beta"]["usage_count"] == 5
        assert by_title["Beta"]["category"] == "Writing"
        assert by_title["Gamma"]["deleted_at"] is not None
        # IDs are preserved across migration (stable identity).
        assert {r["id"] for r in _rows(source, Prompt.__table__)} == {r["id"] for r in _rows(target, Prompt.__table__)}

    def test_progress_reports_copied_reaching_total(self, tmp_path):
        from app.services.migration_service import TableProgress, iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        _seed_source(source)
        events = list(iter_migration(source, target))
        progress = [e for e in events if isinstance(e, TableProgress)]
        done = [e for e in progress if e.phase == "done"]
        assert len(done) == 5  # one "done" per table
        for d in done:
            assert d.copied == d.total
        # The first progress frame per table is a "copying" at 0.
        assert progress[0].phase == "copying"
        assert progress[0].copied == 0

    def test_search_index_populated_on_target_after_copy(self, tmp_path):
        # SQLite FTS5 triggers fire on insert → the index is derived from rows,
        # never copied explicitly by the service.
        from app.services.migration_service import iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        _seed_source(source)
        list(iter_migration(source, target))

        with target.engine.connect() as conn:
            fts_count = conn.execute(text("SELECT count(*) FROM prompts_fts")).scalar()
        assert fts_count == 3


# ── Task 3: rollback / empty-target guard / empty-source / disconnect ────────


class TestRollbackAndGuards:
    def test_failure_mid_copy_rolls_back_target_and_leaves_source_intact(self, tmp_path, monkeypatch):
        # Induce a failure on the prompts insert (after tags were already written
        # inside the same transaction). The whole target transaction must roll
        # back — tags included — and the source must be untouched.
        from app.services import migration_service

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        _seed_source(source)

        real_insert = migration_service.insert

        def failing_insert(table, *args, **kwargs):
            if table.name == "prompts":
                raise RuntimeError("simulated copy failure")
            return real_insert(table, *args, **kwargs)

        monkeypatch.setattr(migration_service, "insert", failing_insert)

        with pytest.raises(RuntimeError, match="simulated copy failure"):
            list(migration_service.iter_migration(source, target))

        # Target rolled back fully — every table empty (the tags rows written
        # before the failure were undone).
        assert _rows(target, Tag.__table__) == []
        assert _rows(target, Prompt.__table__) == []
        # Source is untouched (read-only during migration).
        assert len(_rows(source, Prompt.__table__)) == 3
        assert len(_rows(source, Tag.__table__)) == 2

    def test_populated_target_refused(self, tmp_path):
        from app.services.migration_service import MigrationError, iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        _seed_source(source)
        # Pre-populate the target with a stray tag → must be refused, not truncated.
        session = target.SessionLocal()
        try:
            session.add(Tag(name="preexisting", color="#000000"))
            session.commit()
        finally:
            session.close()

        with pytest.raises(MigrationError, match="not empty"):
            list(iter_migration(source, target))

        # Target unchanged: only its original pre-existing row.
        assert len(_rows(target, Tag.__table__)) == 1
        assert _rows(target, Prompt.__table__) == []

    def test_empty_source_commits_cleanly(self, tmp_path):
        from app.services.migration_service import TableProgress, iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        # No seed → every table is empty on the source.

        events = list(iter_migration(source, target))

        done = [e for e in events if isinstance(e, TableProgress) and e.phase == "done"]
        assert len(done) == 5
        for d in done:
            assert d.copied == 0
            assert d.total == 0
        # Transaction committed with no rows; target stays empty.
        assert _rows(target, Prompt.__table__) == []
        assert _rows(target, Tag.__table__) == []

    def test_generator_close_rolls_back_target(self, tmp_path):
        # Simulates a client disconnect: the route stops calling next() and
        # invokes gen.close(). The open target transaction must roll back.
        from app.services.migration_service import TableProgress, iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        target = _make_sqlite_engine(tmp_path, "tgt")
        _seed_source(source)

        gen = iter_migration(source, target)
        next(gen)  # consume MigrationMeta
        # Drive forward until the prompts copy has started (tags already written
        # in the open transaction by this point).
        for ev in gen:
            if isinstance(ev, TableProgress) and ev.table == "prompts":
                break
        gen.close()  # GeneratorExit → with-block rolls the target back

        # Partial writes (tags) were rolled back.
        assert _rows(target, Tag.__table__) == []
        assert _rows(target, Prompt.__table__) == []
        # Source untouched.
        assert len(_rows(source, Tag.__table__)) == 2


# ── Task 5: cross-dialect integration (PG-gated) ─────────────────────────────

_PG_URL = os.environ.get("L1BR3_PG_TEST_URL")


@pytest.mark.skipif(not _PG_URL, reason="set L1BR3_PG_TEST_URL to run Postgres integration tests")
class TestCrossDialect:
    """Validates the Core copy across dialect boundaries (sqlite ↔ postgresql).

    These skip cleanly without ``L1BR3_PG_TEST_URL``; the default gate stays
    sqlite-only. When run, they exercise the type coercion (TEXT ↔ PG types,
    ``0/1`` ↔ bool, bytes ↔ BYTEA) and confirm each engine's search index is
    populated purely from prompt rows.
    """

    def test_sqlite_to_postgres_full_fidelity(self, tmp_path, pg_engine):
        from app.services.migration_service import iter_migration

        source = _make_sqlite_engine(tmp_path, "src")
        _seed_source(source)
        target = pg_engine
        _clear_all(target)  # ensure empty for the guard
        try:
            list(iter_migration(source, target))

            assert len(_rows(target, Prompt.__table__)) == 3
            assert len(_rows(target, Tag.__table__)) == 2
            assert len(_rows(target, prompt_tags)) == 4
            assert len(_rows(target, TransformMode.__table__)) == 1
            # ciphertext bytes coerce to BYTEA and round-trip exactly
            tgt_providers = _rows(target, AIProviderModel.__table__)
            assert len(tgt_providers) == 1
            assert tgt_providers[0]["encrypted_api_key"] == b"\x01\x02\x03secret"
            # Postgres search_tsv generated column derived from prompt rows.
            with target.engine.connect() as conn:
                tsv = conn.execute(text("SELECT count(*) FROM prompts WHERE search_tsv IS NOT NULL")).scalar()
            assert tsv == 3
        finally:
            _clear_all(target)

    def test_postgres_to_sqlite_full_fidelity(self, tmp_path, pg_engine):
        from app.services.migration_service import iter_migration

        source = pg_engine
        target = _make_sqlite_engine(tmp_path, "tgt")
        _clear_all(source)
        _seed_source(source)
        try:
            list(iter_migration(source, target))

            assert len(_rows(target, Prompt.__table__)) == 3
            assert len(_rows(target, Tag.__table__)) == 2
            assert len(_rows(target, prompt_tags)) == 4
            # SQLite FTS5 triggers fire on insert → index derived from rows.
            with target.engine.connect() as conn:
                fts = conn.execute(text("SELECT count(*) FROM prompts_fts")).scalar()
            assert fts == 3
        finally:
            _clear_all(source)
