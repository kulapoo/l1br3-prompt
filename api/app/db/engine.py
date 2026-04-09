import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

_db_path_env = os.environ.get("L1BR3_DB_PATH")

if _db_path_env:
    DB_PATH = Path(_db_path_env)
else:
    DB_PATH = Path.home() / ".l1br3" / "l1br3.db"

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=os.environ.get("L1BR3_SQL_ECHO", "0") == "1",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
