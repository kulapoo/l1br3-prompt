import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.schemas.ai import EnhanceRequest
from app.services.ai.factory import resolve_provider
from app.services.ai.provider import ProviderError

router = APIRouter(prefix="/api/v1", tags=["enhance"])

ENHANCE_INSTRUCTIONS: dict[str, str] = {
    "summarize": "Rewrite the prompt below to be more concise while preserving its core intent.",
    "concise": "Remove all filler, redundancy, and vague language from the prompt below.",
    "add_role": (
        "Add an appropriate expert role assignment at the start of the prompt below "
        "(e.g. 'You are an expert...')."
    ),
    "chain_of_thought": (
        "Add step-by-step reasoning cues so the AI works through the task systematically."
    ),
    "output_format": (
        "Add a clear, explicit output-format instruction "
        "(structure, length, or format as appropriate)."
    ),
    "best_judgement": (
        "You are a prompt engineering expert. Improve the prompt below using best practices: "
        "add a role if missing, make instructions specific and unambiguous, add an output format "
        "if unspecified, add reasoning cues for complex tasks, and remove filler."
    ),
}


def build_enhance_prompt(req: EnhanceRequest) -> str:
    base = (
        req.instruction
        if req.mode == "custom"
        else ENHANCE_INSTRUCTIONS.get(req.mode, ENHANCE_INSTRUCTIONS["best_judgement"])
    )
    return (
        f"{base}\n\n"
        "Return ONLY the rewritten prompt with no preamble, explanation, or code fences.\n\n"
        "--- PROMPT TO ENHANCE ---\n"
        f"{req.prompt}\n"
        "--- END ---"
    )


@router.post("/enhance")
async def enhance(request: Request, req: EnhanceRequest):
    """
    Stream an AI-enhanced version of the given prompt as Server-Sent Events.

    Resolution order: Ollama (local) → Cloud Fallback (if cloudEnabled=true).

    Each event: `data: {"chunk": "..."}\\n\\n`
    Meta event:  `data: {"meta": {"provider": "ollama|cloud"}}\\n\\n`
    Final event: `data: {"done": true}\\n\\n`
    On error:   `data: {"error": "..."}\\n\\n`
    """
    device_id = request.headers.get("x-device-id")

    try:
        provider, label, provider_status = await resolve_provider(
            request,
            cloud_enabled=req.cloud_enabled,
            device_id=device_id,
        )
    except ProviderError as exc:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    model = req.model or (provider_status.models[0] if provider_status.models else "llama3:8b")
    meta_prompt = build_enhance_prompt(req)

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
