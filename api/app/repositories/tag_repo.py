from sqlalchemy.orm import Session

from app.models.tag import Tag
from app.schemas.tag import TagCreate


class TagRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_all(self) -> list[Tag]:
        return self.db.query(Tag).order_by(Tag.name).all()

    def find_by_id(self, id: str) -> Tag | None:
        return self.db.query(Tag).filter(Tag.id == id).first()

    def find_by_name(self, name: str) -> Tag | None:
        return self.db.query(Tag).filter(Tag.name == name).first()

    def find_or_create(self, name: str, color: str = "#6B7280") -> Tag:
        tag = self.find_by_name(name)
        if tag:
            return tag
        tag = Tag(name=name, color=color)
        self.db.add(tag)
        self.db.flush()
        return tag

    def resolve_tags(self, tag_creates: list[TagCreate]) -> list[Tag]:
        return [self.find_or_create(t.name, t.color) for t in tag_creates]
