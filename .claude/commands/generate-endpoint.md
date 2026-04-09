---
name: Generate Endpoint
description: Scaffold a new FastAPI endpoint with service, schema, and tests.
arguments:
  - name: method
    description: HTTP method (GET, POST, PUT, DELETE)
    required: true
  - name: path
    description: Endpoint path (e.g., /api/v1/prompts)
    required: true
  - name: purpose
    description: Brief description of what the endpoint does
    required: true
  - name: fields
    description: Request body fields (comma separated, optional)
    required: false
---
Create a new endpoint following l1br3-prompt REST conventions.

- Method: {{method}}
- Path: {{path}}
- Purpose: {{purpose}}
- Request body fields: {{fields}}

Steps:
1. Add route to `api/v1/router.py`.
2. Create Pydantic schemas in `schemas.py`.
3. Implement async service function in `services/`.
4. Write pytest in `tests/api/test_{{resource}}.py`.
5. Update OpenAPI by running `/update-openapi`.
