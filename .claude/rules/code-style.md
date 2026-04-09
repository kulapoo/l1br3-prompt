# Code Style Guide

Unified style conventions for l1br3-prompt across Python and TypeScript.

## General Principles

1. **Clarity over cleverness** — code should be readable first
2. **Consistency** — follow existing patterns in the codebase
3. **No premature abstractions** — write what's needed, not what might be needed
4. **Semantic naming** — variable and function names should be self-documenting
5. **DRY where it counts** — avoid duplication of logic, not of lines

## File Organization

### Python Backend
```
backend/
├── main.py                 # Entry point
├── models/                 # SQLAlchemy ORM models
├── schemas/                # Pydantic request/response models
├── routes/                 # API route handlers
├── services/               # Business logic
├── db/                     # Database connection and migrations
└── tests/                  # Test files (mirror structure)
```

### TypeScript Frontend
```
l1br3-prompt/
├── src/
│   ├── components/         # React components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom React hooks
│   ├── types.ts            # Shared types
│   ├── mockData.ts         # Mock data for development
│   └── App.tsx             # Root component
├── entrypoints/            # WXT extension entry points
└── tests/                  # Test files
```

## Naming Conventions

### Python
```python
# Constants: SCREAMING_SNAKE_CASE
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

# Functions/methods: snake_case
def create_prompt(data: PromptCreate) -> Prompt:
    pass

# Classes: PascalCase
class PromptService:
    pass

# Private: _leading_underscore
_internal_helper()
```

### TypeScript
```typescript
// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRIES = 3
const DEFAULT_TIMEOUT = 30

// Functions: camelCase
function createPrompt(data: PromptCreate): Promise<Prompt> {
  return client.post('/prompts', data)
}

// Types/Interfaces: PascalCase
interface PromptProps {
  title: string
}

// React Components: PascalCase
const PromptCard: React.FC<PromptProps> = ({ title }) => {
  return <div>{title}</div>
}

// Private: _leading_underscore
const _internalHelper = () => {}
```

## Comments

### When to Comment

- **Why**, not what: `// Sort by usage count to show most-used prompts first`
- **Clarify assumptions**: `// Assumes prompts are already sorted`
- **Document non-obvious logic**: Complex algorithms, hacks, workarounds
- **TODOs**: `// TODO: Implement cloud sync conflict resolution`

### When NOT to Comment

- Don't restate obvious code: `// Increment counter` above `count += 1`
- Don't comment out code: Delete it or use git history
- Don't comment for every line

## Imports

### Python
```python
# Standard library first
import asyncio
from typing import Optional

# Third-party libraries
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

# Local imports
from models.prompt import Prompt
from schemas.prompt import PromptCreate
```

### TypeScript
```typescript
// External libraries
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

// Internal imports
import { PromptCard } from './components/PromptCard'
import { useAppConfig } from './contexts/AppConfig'
import type { Prompt } from './types'
```

## Line Length

- Python: 88 characters (Black default)
- TypeScript: 100 characters
- Exceptions: URLs, long strings (don't break these)

## Type Annotations

### Python (Pydantic v2)
```python
from pydantic import BaseModel
from typing import Optional

class PromptCreate(BaseModel):
    title: str
    content: str
    tags: list[str] = []  # Use list[T] instead of List[T]
    is_favorite: bool = False
```

### TypeScript
```typescript
// Always type function parameters and returns
function updatePrompt(id: string, data: PromptUpdate): Promise<Prompt> {
  // ...
}

// Use interfaces for objects
interface Prompt {
  id: string
  title: string
  content: string
  tags: string[]
}

// Use `type` for simple unions
type PromptStatus = 'draft' | 'published' | 'archived'
```

## Error Handling

### Python
```python
# Use specific exceptions
from fastapi import HTTPException

@router.get("/prompts/{id}")
def get_prompt(id: int) -> Prompt:
    prompt = db.query(Prompt).get(id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt
```

### TypeScript
```typescript
// Return meaningful errors
async function fetchPrompts(): Promise<Prompt[]> {
  try {
    const response = await fetch('/api/v1/prompts')
    if (!response.ok) {
      throw new Error(`Failed to fetch prompts: ${response.statusText}`)
    }
    return response.json()
  } catch (error) {
    console.error('Fetch error:', error)
    throw error
  }
}
```

## Testing

- Test files are colocated with source (same directory)
- Use `.test.ts` / `_test.py` suffixes
- One test file per module
- Tests should be focused and descriptive

## Formatting

### Python
- Formatter: Black (88 chars)
- Linter: Ruff
- Type checker: Mypy

### TypeScript
- Formatter: Prettier (configured in `.prettierrc`)
- Linter: ESLint
- Style: Tailwind CSS (no inline styles)

See language-specific rules:
- `/rules/python/coding-style.md`
- `/rules/typescript/coding-style.md`
