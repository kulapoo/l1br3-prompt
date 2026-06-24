import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.engine import get_db
from app.repositories.transform_mode_repo import TransformModeRepository
from app.schemas.envelope import ApiResponse
from app.schemas.transform import (
    TransformModeCreate,
    TransformModeResponse,
    TransformRequest,
)
from app.services.ai.factory import resolve_provider
from app.services.ai.provider import ProviderError

router = APIRouter(prefix="/api/v1", tags=["transform"])

BUILTIN_INSTRUCTIONS: dict[str, str] = {
    "summarize": "Rewrite the prompt below to be more concise while preserving its core intent.",
    "concise": "Remove all filler, redundancy, and vague language from the prompt below.",
    "add_role": (
        "Add an appropriate expert role assignment at the start of the prompt below (e.g. 'You are an expert...')."
    ),
    "chain_of_thought": ("Add step-by-step reasoning cues so the AI works through the task systematically."),
    "output_format": ("Add a clear, explicit output-format instruction (structure, length, or format as appropriate)."),
    "best_judgement": (
        "You are a prompt engineering expert. Improve the prompt below using best practices: "
        "add a role if missing, make instructions specific and unambiguous, add an output format "
        "if unspecified, add reasoning cues for complex tasks, and remove filler."
    ),
}

BUILTIN_LABELS: dict[str, str] = {
    "summarize": "Summarize",
    "concise": "Make Concise",
    "add_role": "Add Role",
    "chain_of_thought": "Chain of Thought",
    "output_format": "Specify Output Format",
    "best_judgement": "Best Judgement",
}


def _builtin_responses() -> list[TransformModeResponse]:
    return [
        TransformModeResponse(
            id=key,
            name=BUILTIN_LABELS[key],
            instruction=text,
            is_builtin=True,
        )
        for key, text in BUILTIN_INSTRUCTIONS.items()
    ]


def resolve_instructions(modes: list[str], instruction: str | None, custom_map: dict[str, str]) -> list[str]:
    """Resolve mode ids to their instruction text.

    Built-ins are looked up in BUILTIN_INSTRUCTIONS (id == slug), custom modes in
    ``custom_map`` (id == row UUID). The special id ``"custom"`` uses the free-text
    ``instruction``. If nothing resolves, falls back to ``best_judgement``.
    """
    resolved: list[str] = []
    for mode in modes:
        if mode == "custom":
            if instruction:
                resolved.append(instruction)
        elif mode in custom_map:
            resolved.append(custom_map[mode])
        elif mode in BUILTIN_INSTRUCTIONS:
            resolved.append(BUILTIN_INSTRUCTIONS[mode])
    if not resolved:
        resolved.append(BUILTIN_INSTRUCTIONS["best_judgement"])
    return resolved


def build_transform_prompt(prompt: str, instructions: list[str]) -> str:
    combined = "\n\n".join(instructions)
    return (
        f"{combined}\n\n"
        "Return ONLY the rewritten prompt with no preamble, explanation, or code fences.\n"
        "Remove any {{variable}} placeholders from the output — do not fill them in and "
        "do not preserve them. The placeholders may appear in the input for context only.\n\n"
        "--- PROMPT TO TRANSFORM ---\n"
        f"{prompt}\n"
        "--- END ---"
    )


@router.post("/transform")
async def transform(request: Request, req: TransformRequest, db: Session = Depends(get_db)):
    """
    Stream an AI-transformed version of the given prompt as Server-Sent Events.

    Resolution order: BYOK (explicit) → Ollama (local).

    Each event: `data: {"chunk": "..."}\\n\\n`
    Meta event:  `data: {"meta": {"provider": "ollama|byok:*"}}\\n\\n`
    Final event: `data: {"done": true}\\n\\n`
    On error:   `data: {"error": "..."}\\n\\n`
    """
    try:
        provider, label, provider_status = await resolve_provider(
            request,
            byok=req.byok,
        )
    except ProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    custom_map = {m.id: m.instruction for m in TransformModeRepository(db).find_all()}
    instructions = resolve_instructions(req.modes, req.instruction, custom_map)
    model = req.model or (provider_status.models[0] if provider_status.models else "llama3:8b")
    meta_prompt = build_transform_prompt(req.prompt, instructions)

    async def event_stream():
        yield f"data: {json.dumps({'meta': {'provider': label}})}\n\n"
        try:
            async for chunk in provider.stream(meta_prompt, model=model):
                if await request.is_disconnected():
                    return
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield 'data: {"done": true}\n\n'
        except ProviderError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/transform-modes", response_model=ApiResponse[list[TransformModeResponse]])
def list_transform_modes(db: Session = Depends(get_db)):
    repo = TransformModeRepository(db)
    customs = repo.find_all()
    responses = _builtin_responses() + [TransformModeResponse.model_validate(mode) for mode in customs]
    return ApiResponse.ok(responses)


@router.post(
    "/transform-modes",
    response_model=ApiResponse[TransformModeResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_transform_mode(data: TransformModeCreate, db: Session = Depends(get_db)):
    repo = TransformModeRepository(db)
    mode = repo.create(data.name, data.instruction)
    db.commit()
    db.refresh(mode)
    return ApiResponse.ok(TransformModeResponse.model_validate(mode))


@router.delete("/transform-modes/{id}", response_model=ApiResponse[None])
def delete_transform_mode(id: str, db: Session = Depends(get_db)):
    if id in BUILTIN_INSTRUCTIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Built-in transform modes cannot be deleted",
        )
    repo = TransformModeRepository(db)
    mode = repo.find_by_id(id)
    if not mode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transform mode not found",
        )
    repo.soft_delete(mode)
    db.commit()
    return ApiResponse.ok(None)
