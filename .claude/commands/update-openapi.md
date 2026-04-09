# update-openapi

Update the OpenAPI specification when backend API changes.

## Usage

```
/update-openapi
```

## What It Does

1. Scans FastAPI backend for endpoint definitions
2. Extracts endpoint paths, methods, parameters, and schemas
3. Updates or generates `openapi.json` / `openapi.yaml`
4. Regenerates TypeScript API client from spec

## Typical Workflow

```bash
# After adding new FastAPI endpoint
/update-openapi

# Optionally regenerate client
npm run generate-api-client
```

## Output Files

- `backend/openapi.json` — OpenAPI specification
- `l1br3-prompt/src/api/generated.ts` — Generated TypeScript client
- `l1br3-prompt/src/api/schemas.ts` — Generated types

## Tips

- Keep endpoint docstrings clear for good documentation
- Use Pydantic models for request/response bodies
- Add examples in docstrings for better spec clarity
- Test that generated client compiles before committing

## Example Endpoint

```python
@router.post("/api/v1/prompts")
def create_prompt(prompt: PromptCreate):
    """
    Create a new prompt.
    
    Args:
        prompt: Prompt data (title, content, tags)
        
    Returns:
        Created prompt with auto-assigned ID
    """
    return service.create(prompt)
```

This generates:
```typescript
// Generated from OpenAPI
export function createPrompt(body: PromptCreate): Promise<PromptResponse> {
  return client.post('/api/v1/prompts', {body})
}
```

## Tools

- [OpenAPI Generator](https://openapi-generator.tech/)
- [FastAPI's auto-generated OpenAPI](https://fastapi.tiangolo.com/tutorial/first-steps/#check-the-openapi-schema)
