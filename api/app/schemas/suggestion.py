from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

_camel_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SuggestContext(BaseModel):
    model_config = _camel_config

    url: str | None = None
    selected_text: str | None = None
    page_title: str | None = None
    page_content: str | None = None  # truncated to ~500 chars by caller
    input_text: str | None = None    # sidebar textarea value
    use_ai: bool = False             # opt-in: re-rank with Ollama when True


class SuggestionResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    prompt_id: str
    title: str
    description: str
    action_text: str
    original_text: str | None = None
    suggested_text: str | None = None
    score: float
    rule: str
