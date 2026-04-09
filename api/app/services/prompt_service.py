from sqlalchemy.orm import Session

from app.models.prompt import Prompt
from app.repositories.prompt_repo import PromptRepository
from app.repositories.tag_repo import TagRepository
from app.schemas.prompt import PromptCreate, PromptUpdate


class PromptService:
    def __init__(self, db: Session):
        self.prompt_repo = PromptRepository(db)
        self.tag_repo = TagRepository(db)
        self.db = db

    def list_prompts(
        self,
        search: str | None = None,
        tag: str | None = None,
        category: str | None = None,
        is_favorite: bool | None = None,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[Prompt], int]:
        return self.prompt_repo.find_all(
            search=search,
            tag=tag,
            category=category,
            is_favorite=is_favorite,
            page=page,
            limit=limit,
        )

    def get_prompt(self, id: str) -> Prompt | None:
        return self.prompt_repo.find_by_id(id)

    def create_prompt(self, data: PromptCreate) -> Prompt:
        tags = self.tag_repo.resolve_tags(data.tags)
        prompt = self.prompt_repo.create(data, tags)
        self.db.commit()
        self.db.refresh(prompt)
        return prompt

    def update_prompt(self, id: str, data: PromptUpdate) -> Prompt | None:
        prompt = self.prompt_repo.find_by_id(id)
        if not prompt:
            return None
        tags = self.tag_repo.resolve_tags(data.tags) if data.tags is not None else None
        prompt = self.prompt_repo.update(prompt, data, tags)
        self.db.commit()
        self.db.refresh(prompt)
        return prompt

    def delete_prompt(self, id: str) -> bool:
        prompt = self.prompt_repo.find_by_id(id)
        if not prompt:
            return False
        self.prompt_repo.delete(prompt)
        self.db.commit()
        return True

    def copy_prompt(self, id: str) -> Prompt | None:
        prompt = self.prompt_repo.find_by_id(id)
        if not prompt:
            return None
        prompt = self.prompt_repo.increment_usage(prompt)
        self.db.commit()
        self.db.refresh(prompt)
        return prompt

    def add_tags(self, id: str, tag_creates: list) -> Prompt | None:
        prompt = self.prompt_repo.find_by_id(id)
        if not prompt:
            return None
        tags = self.tag_repo.resolve_tags(tag_creates)
        prompt = self.prompt_repo.add_tags(prompt, tags)
        self.db.commit()
        self.db.refresh(prompt)
        return prompt
