import os

from fastapi import APIRouter

from app.schemas.envelope import ApiResponse
from app.schemas.mcp import McpCallRequest, McpCallResponse

router = APIRouter(prefix="/api/v1", tags=["mcp"])


@router.post("/mcp/call", response_model=ApiResponse[McpCallResponse])
def mcp_call(req: McpCallRequest) -> ApiResponse[McpCallResponse]:
    from app.mcp_server import READ_TOOLS, WRITE_TOOLS

    tool_fn = READ_TOOLS.get(req.tool)
    if tool_fn is None:
        if os.environ.get("L1BR3_MCP_ALLOW_WRITE", "0") == "1":
            tool_fn = WRITE_TOOLS.get(req.tool)
    if tool_fn is None:
        return ApiResponse.fail(f"Unknown or blocked tool: {req.tool!r}")

    try:
        result = tool_fn(**req.args)
        return ApiResponse.ok(McpCallResponse(result=str(result)))
    except Exception as exc:
        return ApiResponse.fail(str(exc))
