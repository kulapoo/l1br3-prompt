"""PostgreSQL database engine + tsvector search backend (Milestone 2).

Concrete impl of the ``DatabaseEngine``/``SearchBackend`` Protocols, mirroring
``app.db.engines.sqlite``. Search parity with SQLite FTS5 is delivered via a
**stored generated tsvector column** + GIN index (zero trigger code; the DB keeps
``search_tsv`` in sync atomically, closer to FTS5's auto-maintained index than a
hand-rolled trigger mirror).

Selection: the registry dispatches to this engine when ``L1BR3_DATABASE_URL`` is a
``postgresql*`` URL. The active engine is otherwise unchanged.

Config: ``L1BR3_DATABASE_URL`` env, or the Database Manager (M3). DB URLs are
encrypted at rest by ``connection_store`` (F18).
"""

import os
from collections.abc import Generator

from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.db.engines.base import SearchBackend

# Parity knob: 'simple' mirrors SQLite FTS5's default tokenizer (no stemming).
# Flip to 'english' here if the parity harness (tests/test_search_parity.py) shows
# recall drift — documented as the single tuning dial in the M2 plan.
SEARCH_DICTIONARY = "simple"

# Stored generated column: title weighted 'A' (rank above), content 'B'. Idempotent
# so re-running migration 005 / search.init() on an already-indexed DB is a no-op.
_TSV_COLUMN_DDL = f"""
    ALTER TABLE prompts
        ADD COLUMN IF NOT EXISTS search_tsv tsvector
        GENERATED ALWAYS AS (
            setweight(to_tsvector('{SEARCH_DICTIONARY}', coalesce(title, '')), 'A') ||
            setweight(to_tsvector('{SEARCH_DICTIONARY}', coalesce(content, '')), 'B')
        ) STORED
"""

_TSV_GIN_DDL = "CREATE INDEX IF NOT EXISTS idx_prompts_search_tsv ON prompts USING GIN (search_tsv)"

# plainto_tsquery (not to_tsquery) tolerates unquoted/punctuated user input — no
# syntax-error bombs, mirroring FTS5's MATCH tolerance. ts_rank_cd orders title
# matches above body matches via the stored weights. Plain string so parity
# assertions can introspect the shape; wrapped in text() at execution.
_SEARCH_SQL = (
    f"SELECT id FROM prompts "
    f"WHERE search_tsv @@ plainto_tsquery('{SEARCH_DICTIONARY}', :q) "
    f"ORDER BY ts_rank_cd(search_tsv, plainto_tsquery('{SEARCH_DICTIONARY}', :q)) DESC"
)

_DROP_INDEX_DDL = "DROP INDEX IF EXISTS idx_prompts_search_tsv"

_DROP_COLUMN_DDL = "ALTER TABLE prompts DROP COLUMN IF EXISTS search_tsv"

# Combined introspection/parity contract (a single plan-named symbol). Execution
# uses the atomic parts above — passing a ``;``-joined string through text() is
# driver-fragile, so drop() runs the two statements individually.
_DROP_DDL = f"{_DROP_INDEX_DDL};\n{_DROP_COLUMN_DDL}"


class _PostgresTsVectorSearch:
    """tsvector search backend for the Postgres engine."""

    def init(self, connection: Connection) -> None:
        connection.execute(text(_TSV_COLUMN_DDL))
        connection.execute(text(_TSV_GIN_DDL))

    def search_prompts(self, db: Session, query: str) -> list[str]:
        rows = db.execute(text(_SEARCH_SQL), {"q": query}).fetchall()
        return [r[0] for r in rows]

    def drop(self, connection: Connection) -> None:
        connection.execute(text(_DROP_INDEX_DDL))
        connection.execute(text(_DROP_COLUMN_DDL))


def _ensure_psycopg_driver(url: str) -> str:
    """Rewrite a bare ``postgresql://`` URL to the installed psycopg v3 driver.

    SQLAlchemy's default for ``postgresql://`` is psycopg2, which we don't ship.
    psycopg v3 is loaded via the ``+psycopg`` driver suffix. Normalizing here keeps
    the engine + migrations (``env.py`` injects ``get_active_engine().url``) working
    from a single dependency, and lets users keep writing the conventional
    ``postgresql://`` form in env / connection store.
    """
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class PostgresEngine:
    """Concrete PostgreSQL ``DatabaseEngine``.

    Mirrors ``SqliteEngine``: takes a resolved URL, builds ``engine`` +
    ``SessionLocal``, owns a nested ``_PostgresTsVectorSearch``. Config precedence
    lives in ``from_env``; tests construct directly.
    """

    def __init__(self, url: str, *, poolclass: type | None = None) -> None:
        self.url = _ensure_psycopg_driver(url)
        kwargs: dict[str, object] = {
            "pool_pre_ping": True,
            "echo": os.environ.get("L1BR3_SQL_ECHO", "0") == "1",
        }
        if poolclass is not None:
            # Caller-supplied pool (e.g. NullPool in migrations) — pool_size args
            # only apply to the default QueuePool.
            kwargs["poolclass"] = poolclass
        else:
            kwargs["pool_size"] = 5
            kwargs["max_overflow"] = 10
        self.engine: Engine = create_engine(self.url, **kwargs)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.search: SearchBackend = _PostgresTsVectorSearch()
        self.dialect = "postgresql"

    def init_schema(self, connection: Connection) -> None:
        # Schema is Alembic's job (migration 005 carries the tsvector DDL). Hook is
        # an inert no-op so ``DatabaseEngine``-blind callers (tests) don't double-
        # apply. Mirrors ``SqliteEngine.init_schema``.
        return None

    def get_db(self) -> Generator[Session, None, None]:
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

    @classmethod
    def from_env(cls) -> "PostgresEngine":
        """Resolve the Postgres URL from ``L1BR3_DATABASE_URL``.

        Unlike ``SqliteEngine.from_env``, there is no zero-config default for
        Postgres — an explicit URL is mandatory. Raises an actionable error
        otherwise (mirrors ``services/ai/factory`` error style).
        """
        url = os.environ.get("L1BR3_DATABASE_URL")
        if not url:
            raise ValueError("PostgresEngine requires L1BR3_DATABASE_URL=postgresql://…")
        if not url.startswith("postgresql"):
            raise ValueError("PostgresEngine requires a PostgreSQL URL; use SqliteEngine for sqlite:// URLs.")
        return cls(url)
