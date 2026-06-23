import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.ai import router as ai_router
from app.routes.categories import router as categories_router
from app.routes.generate import router as generate_router
from app.routes.health import router as health_router
from app.routes.mcp import router as mcp_router
from app.routes.prompts import router as prompts_router
from app.routes.transform import router as transform_router


def _run_migrations() -> None:
    if os.environ.get("L1BR3_TESTING") == "1":
        return
    import alembic.command
    import alembic.config
    cfg = alembic.config.Config("alembic.ini")
    alembic.command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    # Single shared AsyncClient for all outbound HTTP calls (Ollama, etc.)
    # Using limits to prevent memory creep from idle connections.
    app.state.http = httpx.AsyncClient(
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
    )
    yield
    await app.state.http.aclose()


app = FastAPI(
    title="l1br3-prompt API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "moz-extension://*",
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(prompts_router)
app.include_router(categories_router)
app.include_router(ai_router)
app.include_router(generate_router)
app.include_router(transform_router)
app.include_router(mcp_router)


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    run()
