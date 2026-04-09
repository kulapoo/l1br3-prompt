from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.prompt import Prompt
from app.models.tag import Tag
from app.schemas.prompt import PromptCreate, PromptUpdate


class PromptRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_all(
        self,
        search: str | None = None,
        tag: str | None = None,
        category: str | None = None,
        is_favorite: bool | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[Prompt], int]:
        if search:
            # FTS5 search: join fts results back to prompts via rowid to get UUIDs
            fts_sql = text(
                "SELECT p.id FROM prompts p "
                "JOIN prompts_fts ON prompts_fts.rowid = p.rowid "
                "WHERE prompts_fts MATCH :q ORDER BY rank"
            )
            rows = self.db.execute(fts_sql, {"q": search}).fetchall()
            matched_ids = [r[0] for r in rows]
            if not matched_ids:
                return [], 0
            query = self.db.query(Prompt).filter(Prompt.id.in_(matched_ids))
        else:
            query = self.db.query(Prompt)

        if category:
            query = query.filter(Prompt.category == category)
        if is_favorite is not None:
            query = query.filter(Prompt.is_favorite == is_favorite)
        if tag:
            query = query.filter(Prompt.tags.any(Tag.name == tag))

        total = query.count()
        offset = (page - 1) * limit
        items = query.offset(offset).limit(limit).all()
        return items, total

    def find_by_id(self, id: str) -> Prompt | None:
        return self.db.query(Prompt).filter(Prompt.id == id).first()

    def create(self, data: PromptCreate, tags: list[Tag]) -> Prompt:
        prompt = Prompt(
            title=data.title,
            content=data.content,
            category=data.category,
            is_favorite=data.is_favorite,
            tags=tags,
        )
        self.db.add(prompt)
        self.db.flush()
        self.db.refresh(prompt)
        return prompt

    def update(self, prompt: Prompt, data: PromptUpdate, tags: list[Tag] | None) -> Prompt:
        if data.title is not None:
            prompt.title = data.title
        if data.content is not None:
            prompt.content = data.content
        if data.category is not None:
            prompt.category = data.category
        if data.is_favorite is not None:
            prompt.is_favorite = data.is_favorite
        if tags is not None:
            prompt.tags = tags
        self.db.flush()
        self.db.refresh(prompt)
        return prompt

    def delete(self, prompt: Prompt) -> None:
        self.db.delete(prompt)
        self.db.flush()

    def increment_usage(self, prompt: Prompt) -> Prompt:
        prompt.usage_count += 1
        prompt.last_used = datetime.now(timezone.utc).isoformat()
        self.db.flush()
        self.db.refresh(prompt)
        return prompt

    def add_tags(self, prompt: Prompt, tags: list[Tag]) -> Prompt:
        existing_ids = {t.id for t in prompt.tags}
        for tag in tags:
            if tag.id not in existing_ids:
                prompt.tags.append(tag)
        self.db.flush()
        self.db.refresh(prompt)
        return prompt
