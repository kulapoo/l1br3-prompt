"""Search-path tests through the new SearchBackend delegation (Task 4).

Asserts the repository delegates to ``get_active_engine().search`` and that no
dialect-specific FTS SQL remains inline in the repository (acceptance criterion).
"""

import inspect

from app.db.engines.registry import get_active_engine
from app.repositories import prompt_repo
from app.repositories.prompt_repo import PromptRepository


class TestSearchDelegation:
    def test_find_all_delegates_search_to_backend(self, db, monkeypatch):
        # Arrange: a prompt that would otherwise match FTS.
        from app.models.prompt import Prompt
        from datetime import datetime, timezone

        prompt = Prompt(title="Python debugging", content="Use pdb", category="Code")
        db.add(prompt)
        db.flush()

        called: list[str] = []
        real_search = get_active_engine().search

        class SpySearch:
            def search_prompts(self, _db, query):
                called.append(query)
                # Return the real FTS match to prove delegation, not the SQL.
                return real_search.search_prompts(_db, query)

        monkeypatch.setattr(get_active_engine(), "search", SpySearch())

        items, total = PromptRepository(db).find_all(search="python")
        assert called == ["python"]
        assert total == 1
        assert items[0].title.startswith("Python")

    def test_find_all_no_search_does_not_call_backend(self, db, monkeypatch):
        called: list[bool] = []

        class SpySearch:
            def search_prompts(self, *_a, **_k):
                called.append(True)
                return []

        monkeypatch.setattr(get_active_engine(), "search", SpySearch())

        PromptRepository(db).find_all()
        assert called == []

    def test_find_all_search_empty_result_short_circuits(self, db, monkeypatch):
        class EmptySearch:
            def search_prompts(self, *_a, **_k):
                return []

        monkeypatch.setattr(get_active_engine(), "search", EmptySearch())

        items, total = PromptRepository(db).find_all(search="nothing")
        assert items == []
        assert total == 0

    def test_repository_has_no_inline_fts_sql(self):
        """Acceptance: PromptRepository contains no dialect-specific SQL."""
        source = inspect.getsource(prompt_repo)
        assert "prompts_fts" not in source
        assert "MATCH" not in source
