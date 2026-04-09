# FastAPI Best Practices for l1br3-prompt

> **Project Constraints:**
> - Backend binds to `127.0.0.1` only.
> - All endpoints are async.
> - Use `SQLAlchemy` async sessions.
> - Pydantic v2 for validation.

---

## 1. Project Structure
```
backend/
├── main.py # FastAPI app creation, lifespan, CORS (if needed)
├── config.py # Pydantic settings (env vars)
├── database.py # Async engine, session factory
├── models/ # SQLAlchemy ORM models
├── schemas/ # Pydantic request/response models
├── services/ # Business logic layer
├── api/
│ └── v1/
│ ├── router.py # Aggregates all endpoint routers
│ ├── prompts.py # Prompt CRUD endpoints
│ ├── suggestions.py # AI suggestion endpoints
│ └── sync.py # Cloud sync endpoints
├── core/
│ ├── security.py # Encryption, localhost checks
│ └── exceptions.py # Custom exception classes
├── mcp_server.py # MCP server implementation (Phase 4)
└── tests/ # pytest async tests
```


---

## 2. Application Lifespan & Local‑Only Binding


**`main.py`**
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from database import engine
from models.base import Base

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: dispose engine
    await engine.dispose()

app = FastAPI(
    title="l1br3-prompt API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

# Run with: uvicorn main:app --host 127.0.0.1 --port 8000
# Never bind to 0.0.0.0
```
