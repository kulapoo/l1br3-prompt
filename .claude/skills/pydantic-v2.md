# Pydantic V2 Skill

Pydantic v2 is a data validation and parsing library for Python using type hints.

## Quick Reference

### Basic Model
```python
from pydantic import BaseModel, Field
from typing import Optional

class Prompt(BaseModel):
    id: int
    title: str
    content: str
    tags: list[str] = []
    is_favorite: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    
    class Config:
        json_schema_extra = {"example": {...}}
```

### Validation
```python
from pydantic import field_validator, model_validator

class Prompt(BaseModel):
    title: str
    
    @field_validator('title')
    @classmethod
    def title_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Title cannot be empty')
        return v

    @model_validator(mode='after')
    def check_content(self):
        # Validation across multiple fields
        return self
```

### Common Patterns

**Query Parameters**
```python
from pydantic import BaseModel

class PromptQuery(BaseModel):
    search: Optional[str] = None
    tag: Optional[str] = None
    limit: int = 10
    skip: int = 0
```

**Response Models**
```python
class PromptResponse(BaseModel):
    id: int
    title: str
    # ... fields
    
    model_config = ConfigDict(from_attributes=True)  # For ORM
```

**Partial Updates**
```python
from typing import Optional

class PromptUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    # Only include fields that might be updated
```

## Resources
- [Pydantic Docs](https://docs.pydantic.dev/latest/)
- [Field Validators](https://docs.pydantic.dev/latest/concepts/validators/)
- [JSON Schema](https://docs.pydantic.dev/latest/concepts/json_schema/)
