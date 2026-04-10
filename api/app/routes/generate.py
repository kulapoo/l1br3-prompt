import json

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.schemas.ai import (
    GenerateRequest,
    ProcessTemplateRequest,
    ProcessTemplateResponse,
)
from app.schemas.envelope import ApiResponse
from app.services.ai.ollama import OllamaProvider
from app.services.ai.provider import ProviderError
from app.services.template_service import TemplateService

router = APIRouter(prefix="/api/v1", tags=["generate"])

_template_service = TemplateService()


@router.post("/generate")
async def generate(request: Request, req: GenerateRequest):
    """
    Stream an AI-generated response as Server-Sent Events.

    Each event: `data: {"chunk": "..."}\\n\\n`
    Final event: `data: {"done": true}\\n\\n`
    On error:   `data: {"error": "..."}\\n\\n`
    """
    provider = OllamaProvider(request.app.state.http)
    ollama_status = await provider.health()
    if not ollama_status.reachable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ollama not reachable. Install from https://ollama.com and pull a model.",
        )

    model = req.model or (ollama_status.models[0] if ollama_status.models else "llama3:8b")

    async def event_stream():
        try:
            async for chunk in provider.stream(req.prompt, model=model, options=req.options):
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
            # Prevent nginx / reverse proxies from buffering the stream
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/process-template",
    response_model=ApiResponse[ProcessTemplateResponse],
)
def process_template(req: ProcessTemplateRequest):
    """Render a Jinja2 template with the given variables."""
    try:
        rendered = _template_service.render(req.template, req.variables)
        variables = _template_service.find_variables(req.template)
        return ApiResponse.ok(ProcessTemplateResponse(rendered=rendered, variables=variables))
    except Exception as exc:
        return ApiResponse.fail(str(exc))
