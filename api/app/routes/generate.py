import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.schemas.ai import (
    GenerateRequest,
    ProcessTemplateRequest,
    ProcessTemplateResponse,
)
from app.schemas.envelope import ApiResponse
from app.services.ai.factory import resolve_provider
from app.services.ai.provider import ProviderError
from app.services.template_service import TemplateService

router = APIRouter(prefix="/api/v1", tags=["generate"])

_template_service = TemplateService()


@router.post("/generate")
async def generate(request: Request, req: GenerateRequest):
    """
    Stream an AI-generated response as Server-Sent Events.

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
        )

    # Pick the best available model — reuse the status from the factory health check.
    model = req.model or (provider_status.models[0] if provider_status.models else "llama3:8b")

    async def event_stream():
        # Announce which provider is serving this request.
        yield f"data: {json.dumps({'meta': {'provider': label}})}\n\n"
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
