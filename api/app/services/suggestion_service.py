import logging
import re
import uuid
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.prompt import Prompt
from app.repositories.prompt_repo import PromptRepository
from app.schemas.suggestion import SuggestContext, SuggestionResponse

logger = logging.getLogger(__name__)

# (regex_pattern, tag_names, category_names, description_template)
_URL_RULES: list[tuple[str, list[str], list[str], str]] = [
    (r"github\.com/.+/pull/", ["Review", "Code"], ["Code"], "Matched GitHub PR page"),
    (r"github\.com", ["Code"], ["Code"], "Matched GitHub page"),
    (r"(mail\.google\.com|outlook\.live|outlook\.office)", ["Email"], ["Communication", "Email"], "Matched email client"),
    (r"docs\.google\.com", ["Writing"], ["Writing", "Documentation"], "Matched Google Docs"),
    (r"(notion\.so|confluence)", ["Writing"], ["Writing", "Documentation"], "Matched docs/notes app"),
    (r"(stackoverflow\.com|stackexchange\.com)", ["Code", "Debug"], ["Code"], "Matched Stack Overflow"),
    (r"(jira|linear\.app|asana\.com)", ["Review"], ["Project Management"], "Matched project management tool"),
]

_CODE_SIGNALS = re.compile(
    r"\b(function|def |class |import |export |const |let |var |return |if \(|for \(|\{|\})\b",
    re.IGNORECASE,
)


def _looks_like_code(text: str) -> bool:
    return bool(_CODE_SIGNALS.search(text))


def _has_variable_placeholder(content: str) -> bool:
    return bool(re.search(r"\{\{[^}]+\}\}", content))


class SuggestionService:
    def __init__(self, db: Session):
        self._repo = PromptRepository(db)
        self._db = db

    async def suggest(
        self,
        ctx: SuggestContext,
        provider=None,  # OllamaProvider | None — optional to avoid circular import
    ) -> list[SuggestionResponse]:
        # scores[prompt_id] -> (score, description, rule_name)
        scores: dict[str, list[tuple[float, str, str]]] = defaultdict(list)

        all_prompts, _ = self._repo.find_all(limit=200)
        prompt_map: dict[str, Prompt] = {p.id: p for p in all_prompts}

        self._apply_url_rules(ctx, all_prompts, scores)
        self._apply_selected_text_rule(ctx, all_prompts, scores)
        self._apply_keyword_rule(ctx, scores)
        self._apply_boost_rules(all_prompts, scores)

        if not scores:
            return []

        # Aggregate scores per prompt
        aggregated: dict[str, tuple[float, str, str]] = {}
        for prompt_id, hits in scores.items():
            if prompt_id not in prompt_map:
                continue
            total_score = sum(h[0] for h in hits)
            # Use description from highest-scoring rule hit
            best = max(hits, key=lambda h: h[0])
            aggregated[prompt_id] = (total_score, best[1], best[2])

        ranked = sorted(aggregated.items(), key=lambda x: x[1][0], reverse=True)[:10]

        results: list[SuggestionResponse] = []
        for prompt_id, (score, description, rule) in ranked:
            prompt = prompt_map[prompt_id]
            results.append(
                SuggestionResponse(
                    id=str(uuid.uuid4()),
                    prompt_id=prompt_id,
                    title=prompt.title,
                    description=description,
                    action_text=f"Use: {prompt.title}",
                    original_text=ctx.selected_text or ctx.input_text,
                    suggested_text=prompt.content,
                    score=round(score, 2),
                    rule=rule,
                )
            )

        # AI enhancement: re-describe top results with contextual explanations
        if provider is not None and ctx.use_ai and results:
            results = await self._ai_enhance(ctx, results[:5], provider)

        return results

    async def _ai_enhance(
        self,
        ctx: SuggestContext,
        results: list[SuggestionResponse],
        provider,
    ) -> list[SuggestionResponse]:
        """Ask Ollama to write contextual descriptions for the top suggestions."""
        context_parts: list[str] = []
        if ctx.url:
            context_parts.append(f"URL: {ctx.url}")
        if ctx.page_title:
            context_parts.append(f"Page: {ctx.page_title}")
        if ctx.selected_text:
            context_parts.append(f"Selected text: {ctx.selected_text[:200]}")
        elif ctx.input_text:
            context_parts.append(f"Input: {ctx.input_text[:200]}")

        context_str = "\n".join(context_parts) if context_parts else "No specific context"
        prompts_list = "\n".join(f'{i + 1}. "{r.title}"' for i, r in enumerate(results))

        prompt = (
            "Given this context, write a brief one-sentence explanation of why each "
            "prompt template is relevant to the user's current situation.\n\n"
            f"Context:\n{context_str}\n\n"
            f"Prompt templates:\n{prompts_list}\n\n"
            "Respond with exactly one line per template, numbered: '1. <explanation>'"
        )

        try:
            status = await provider.health()
            if not status.reachable:
                return results
            model = status.models[0] if status.models else "llama3:8b"
            response = await provider.generate(prompt, model=model)

            # Parse "1. <text>" lines
            parsed: dict[int, str] = {}
            for line in response.strip().split("\n"):
                m = re.match(r"^(\d+)\.\s+(.+)", line.strip())
                if m:
                    parsed[int(m.group(1))] = m.group(2).strip()

            for i, result in enumerate(results):
                if i + 1 in parsed:
                    result.description = parsed[i + 1]
        except Exception:
            # Fall back silently to rule-based descriptions
            logger.debug("AI enhancement failed; using rule-based descriptions", exc_info=True)

        return results

    def _apply_url_rules(
        self,
        ctx: SuggestContext,
        prompts: list[Prompt],
        scores: dict[str, list[tuple[float, str, str]]],
    ) -> None:
        if not ctx.url:
            return
        for pattern, tag_names, category_names, description in _URL_RULES:
            if re.search(pattern, ctx.url, re.IGNORECASE):
                for prompt in prompts:
                    prompt_tag_names = {t.name for t in prompt.tags}
                    tag_match = bool(prompt_tag_names & set(tag_names))
                    cat_match = prompt.category in category_names
                    if tag_match or cat_match:
                        scores[prompt.id].append((3.0, description, "url_pattern"))
                break  # use the first matching URL rule

    def _apply_selected_text_rule(
        self,
        ctx: SuggestContext,
        prompts: list[Prompt],
        scores: dict[str, list[tuple[float, str, str]]],
    ) -> None:
        text = ctx.selected_text or ctx.input_text
        if not text or len(text.strip()) < 10:
            return

        is_code = _looks_like_code(text)
        for prompt in prompts:
            has_var = _has_variable_placeholder(prompt.content)
            prompt_tag_names = {t.name for t in prompt.tags}
            is_code_prompt = "Code" in prompt_tag_names or prompt.category in ("Code", "Debug")

            if has_var and is_code and is_code_prompt:
                scores[prompt.id].append((2.5, "Matches code input with variable placeholder", "selected_text"))
            elif has_var:
                scores[prompt.id].append((2.0, "Has variable placeholder matching your input", "selected_text"))
            elif is_code and is_code_prompt:
                scores[prompt.id].append((1.5, "Matches code input", "selected_text"))

    def _apply_keyword_rule(
        self,
        ctx: SuggestContext,
        scores: dict[str, list[tuple[float, str, str]]],
    ) -> None:
        parts = [p for p in [ctx.input_text, ctx.page_title] if p]
        if not parts:
            return
        query = " ".join(parts[:2])[:200]  # cap query length

        try:
            # Use OR between words for better recall; FTS5 default is AND
            words = [w for w in query.split() if len(w) > 2]
            if not words:
                return
            fts_query = " OR ".join(words)
            fts_sql = text(
                "SELECT p.id FROM prompts p "
                "JOIN prompts_fts ON prompts_fts.rowid = p.rowid "
                "WHERE prompts_fts MATCH :q ORDER BY rank"
            )
            rows = self._db.execute(fts_sql, {"q": fts_query}).fetchall()
            for row in rows:
                scores[row[0]].append((2.0, f"Keyword match for: {query[:50]}", "keyword_match"))
        except Exception:
            # FTS query can fail on special chars; skip gracefully
            pass

    def _apply_boost_rules(
        self,
        prompts: list[Prompt],
        scores: dict[str, list[tuple[float, str, str]]],
    ) -> None:
        for prompt in prompts:
            if prompt.id not in scores:
                continue
            if prompt.is_favorite:
                # multiply existing scores by 1.5 — add a boost entry
                current = sum(h[0] for h in scores[prompt.id])
                scores[prompt.id].append((current * 0.5, "Favorite boost", "favorite_boost"))
            if prompt.usage_count > 0:
                boost = min(prompt.usage_count * 0.1, 1.0)
                scores[prompt.id].append((boost, "Usage boost", "usage_boost"))
