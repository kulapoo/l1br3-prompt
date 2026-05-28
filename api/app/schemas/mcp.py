from pydantic import BaseModel


class McpCallRequest(BaseModel):
    tool: str
    args: dict = {}


class McpCallResponse(BaseModel):
    result: str
