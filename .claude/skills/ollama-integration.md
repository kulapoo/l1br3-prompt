# Ollama Integration Skill

Ollama enables running large language models locally. This skill covers integration with l1br3-prompt.

## Quick Reference

### Setup
```bash
# Install Ollama from https://ollama.ai
# Run Ollama in background
ollama serve

# Pull a model
ollama pull mistral  # or llama2, neural-chat, etc
```

### Connection
```python
import httpx
import json

OLLAMA_URL = "http://localhost:11434"

async def call_ollama(prompt: str, model: str = "mistral") -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False
            }
        )
    result = response.json()
    return result.get("response", "")
```

### Streaming
```python
async def stream_ollama(prompt: str, model: str = "mistral"):
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": True
            }
        ) as response:
            async for line in response.aiter_lines():
                if line:
                    data = json.loads(line)
                    yield data.get("response", "")
```

### Health Check
```python
async def is_ollama_running() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            return response.status_code == 200
    except:
        return False
```

### Available Models
- `mistral` — 7B, fast and capable
- `llama2` — 7B, general purpose
- `neural-chat` — 7B, conversational
- `orca-mini` — 3B, lightweight
- See [Ollama Models](https://ollama.ai/library)

## Integration Points

**Backend Endpoint**
```python
@router.post("/api/v1/suggest")
async def suggest(context: SuggestRequest):
    if not await is_ollama_running():
        return {"error": "Ollama not available"}
    
    suggestion = await call_ollama(context.prompt)
    return {"suggestion": suggestion}
```

**MCP Server**
```python
# Expose Ollama through MCP for Claude/ChatGPT integration
tools = [
    Tool(
        name="generate_prompt_suggestion",
        description="Get AI suggestions for prompts",
        handler=call_ollama
            )
]
```

## Resources
- [Ollama Docs](https://github.com/ollama/ollama)
- [Model Library](https://ollama.ai/library)
- [API Reference](https://github.com/ollama/ollama/blob/main/docs/api.md)
