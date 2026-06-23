from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models.transform_mode import TransformMode


class TransformModeRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_all(self, include_deleted: bool = False) -> list[TransformMode]:
        query = self.db.query(TransformMode)
        if not include_deleted:
            query = query.filter(TransformMode.deleted_at.is_(None))
        return query.order_by(TransformMode.created_at.asc()).all()

    def find_by_id(self, id: str, include_deleted: bool = False) -> TransformMode | None:
        query = self.db.query(TransformMode).filter(TransformMode.id == id)
        if not include_deleted:
            query = query.filter(TransformMode.deleted_at.is_(None))
        return query.first()

    def create(self, name: str, instruction: str) -> TransformMode:
        mode = TransformMode(name=name, instruction=instruction)
        self.db.add(mode)
        self.db.flush()
        self.db.refresh(mode)
        return mode

    def soft_delete(self, mode: TransformMode) -> None:
        mode.deleted_at = datetime.now(UTC)
        self.db.flush()
