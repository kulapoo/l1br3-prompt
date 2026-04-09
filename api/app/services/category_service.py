from sqlalchemy import text
from sqlalchemy.orm import Session


class CategoryService:
    def __init__(self, db: Session):
        self.db = db

    def get_all_categories(self) -> list[str]:
        rows = self.db.execute(
            text("SELECT DISTINCT category FROM prompts ORDER BY category")
        ).fetchall()
        return [row[0] for row in rows]
