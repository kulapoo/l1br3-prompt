"""
l1br3-prompt MCP server — exposes stored prompts as tools for MCP-compatible
AI assistants (e.g. ChatGPT).

Run via:
    l1br3-mcp            (after `uv tool install .` or from the virtual-env)
    python -m app.mcp_server

Register the server with your MCP client using the `l1br3-mcp` command.

Write tools (create_prompt, delete_prompt) are disabled by default.
Set L1BR3_MCP_ALLOW_WRITE=1 to enable them.
"""

import json
import os
from collections.abc import Callable

from mcp.server.fastmcp import FastMCP

from app.db.engine import SessionLocal
from app.repositories.prompt_repo import PromptRepository
from app.services.template_service import TemplateService

mcp = FastMCP("l1br3-prompt")

_template_service = TemplateService()
_ALLOW_WRITE = os.environ.get("L1BR3_MCP_ALLOW_WRITE", "0") == "1"


def _require_write() -> None:
    if not _ALLOW_WRITE:
        raise PermissionError("Write operations are disabled. Set L1BR3_MCP_ALLOW_WRITE=1 to enable.")


# ── Read-only tool implementations (callable without MCP transport) ───────────


def _list_prompts(query: str | None = None, tag: str | None = None) -> str:
    with SessionLocal() as db:
        repo = PromptRepository(db)
        prompts, _ = repo.find_all(search=query, tag=tag, limit=50)
        result = [
            {
                "id": p.id,
                "title": p.title,
                "content": p.content,
                "category": p.category,
                "tags": [t.name for t in p.tags],
                "isFavorite": p.is_favorite,
            }
            for p in prompts
        ]
    return json.dumps(result, ensure_ascii=False)


def _get_prompt(id: str) -> str:
    with SessionLocal() as db:
        repo = PromptRepository(db)
        prompt = repo.find_by_id(id)
        if not prompt:
            raise ValueError(f"Prompt {id!r} not found")
        result = {
            "id": prompt.id,
            "title": prompt.title,
            "content": prompt.content,
            "category": prompt.category,
            "tags": [t.name for t in prompt.tags],
            "isFavorite": prompt.is_favorite,
        }
    return json.dumps(result, ensure_ascii=False)


def _render_prompt(id: str, variables: dict | None = None) -> str:
    vars_ = variables or {}
    with SessionLocal() as db:
        repo = PromptRepository(db)
        prompt = repo.find_by_id(id)
        if not prompt:
            raise ValueError(f"Prompt {id!r} not found")
        rendered = _template_service.render(prompt.content, vars_)
    return rendered


# ── Read-only tools ────────────────────────────────────────────────────────────


@mcp.tool()
def list_prompts(query: str | None = None, tag: str | None = None) -> str:
    """
    List stored prompts with optional full-text search and tag filter.

    Returns a JSON array of prompt objects.
    """
    return _list_prompts(query=query, tag=tag)


@mcp.tool()
def get_prompt(id: str) -> str:
    """
    Get a single prompt by its ID.

    Returns a JSON object with the prompt's fields.
    """
    return _get_prompt(id=id)


@mcp.tool()
def render_prompt(id: str, variables: dict | None = None) -> str:
    """
    Render a prompt template with the given variables substituted.

    Variables should match {{placeholder}} names in the prompt content.
    Returns the rendered plain-text string.
    """
    return _render_prompt(id=id, variables=variables)


# ── Write tools (gated by L1BR3_MCP_ALLOW_WRITE) ──────────────────────────────


@mcp.tool()
def create_prompt(
    title: str,
    content: str,
    category: str = "General",
    tags: list[str] | None = None,
) -> str:
    """
    Create a new prompt. Requires L1BR3_MCP_ALLOW_WRITE=1.

    Returns a JSON object with the new prompt's id and title.
    """
    _require_write()

    from app.schemas.prompt import PromptCreate
    from app.schemas.tag import TagCreate
    from app.services.prompt_service import PromptService

    with SessionLocal() as db:
        service = PromptService(db)
        data = PromptCreate(
            title=title,
            content=content,
            category=category,
            tags=[TagCreate(name=t) for t in (tags or [])],
        )
        prompt = service.create_prompt(data)
        result = {"id": prompt.id, "title": prompt.title}
    return json.dumps(result)


@mcp.tool()
def delete_prompt(id: str) -> str:
    """
    Delete a prompt by ID. Requires L1BR3_MCP_ALLOW_WRITE=1.

    Returns a JSON object confirming the deleted id.
    """
    _require_write()

    from app.services.prompt_service import PromptService

    with SessionLocal() as db:
        service = PromptService(db)
        deleted = service.delete_prompt(id)
        if not deleted:
            raise ValueError(f"Prompt {id!r} not found")
    return json.dumps({"deleted": id})


# ── Tool registries (used by the HTTP bridge in routes/mcp.py) ────────────────

READ_TOOLS: dict[str, Callable] = {
    "list_prompts": _list_prompts,
    "get_prompt": _get_prompt,
    "render_prompt": _render_prompt,
}

WRITE_TOOLS: dict[str, Callable] = {
    "create_prompt": create_prompt,
    "delete_prompt": delete_prompt,
}


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
