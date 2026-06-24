"""SQLite database engine + FTS5 search backend.

Concrete impl of the ``DatabaseEngine``/``SearchBackend`` Protocols. Owns the
exact behavior previously hardcoded in ``app.db.engine`` (check_same_thread=False,
echo flag) and the FTS5 virtual table + triggers previously inlined in
``conftest.py`` and migration ``001_initial``.

Config precedence: ``L1BR3_DATABASE_URL`` (any SQLAlchemy URL) >
``L1BR3_DB_PATH`` (SQLite path, backward-compat) > ``~/.l1br3/l1br3.db``.
"""

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.db.engines.base import SearchBackend

DEFAULT_DB_PATH = Path.home() / ".l1br3" / "l1br3.db"

_FTS_TABLE_DDL = """
    CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
        title,
        content,
        content='prompts',
        content_rowid='rowid'
    )
"""

_AI_TRIGGER_DDL = """
    CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
        INSERT INTO prompts_fts(rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
    END
"""

_AD_TRIGGER_DDL = """
    CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
        INSERT INTO prompts_fts(prompts_fts, rowid, title, content)
        VALUES ('delete', old.rowid, old.title, old.content);
    END
"""

_AU_TRIGGER_DDL = """
    CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
        INSERT INTO prompts_fts(prompts_fts, rowid, title, content)
        VALUES ('delete', old.rowid, old.title, old.content);
        INSERT INTO prompts_fts(rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
    END
"""

_SEARCH_PROMPTS_SQL = text(
    "SELECT p.id FROM prompts p "
    "JOIN prompts_fts ON prompts_fts.rowid = p.rowid "
    "WHERE prompts_fts MATCH :q ORDER BY rank"
)


class _SqliteFtsSearch:
    """FTS5 search backend for the SQLite engine."""

    def init(self, connection: object) -> None:
        connection.execute(text(_FTS_TABLE_DDL))
        connection.execute(text(_AI_TRIGGER_DDL))
        connection.execute(text(_AD_TRIGGER_DDL))
        connection.execute(text(_AU_TRIGGER_DDL))

    def search_prompts(self, db: Session, query: str) -> list[str]:
        rows = db.execute(_SEARCH_PROMPTS_SQL, {"q": query}).fetchall()
        return [r[0] for r in rows]

    def drop(self, connection: object) -> None:
        connection.execute(text("DROP TRIGGER IF EXISTS prompts_au"))
        connection.execute(text("DROP TRIGGER IF EXISTS prompts_ad"))
        connection.execute(text("DROP TRIGGER IF EXISTS prompts_ai"))
        connection.execute(text("DROP TABLE IF EXISTS prompts_fts"))


class SqliteEngine:
    """Concrete SQLite ``DatabaseEngine``.

    Construction takes a resolved URL so config precedence lives in one place
    (``from_env``) and tests can wire up ``sqlite://`` in-memory engines directly.
    """

    def __init__(self, url: str) -> None:
        self.url = url
        self.engine: Engine = create_engine(
            url,
            connect_args={"check_same_thread": False},
            echo=os.environ.get("L1BR3_SQL_ECHO", "0") == "1",
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.search: SearchBackend = _SqliteFtsSearch()

    @property
    def dialect(self) -> str:
        return "sqlite"

    def init_schema(self, connection: object) -> None:
        # SQLite relies on Alembic migrations for production fresh-DB schema;
        # tests build tables from Base.metadata directly. No-op here.
        return None

    def get_db(self) -> Generator[Session, None, None]:
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    @classmethod
    def from_env(cls) -> "SqliteEngine":
        """Resolve the SQLite URL from env, applying the documented precedence."""
        database_url = os.environ.get("L1BR3_DATABASE_URL")
        if database_url:
            return cls(database_url)

        db_path_env = os.environ.get("L1BR3_DB_PATH")
        db_path = Path(db_path_env) if db_path_env else DEFAULT_DB_PATH
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return cls(f"sqlite:///{db_path}")
