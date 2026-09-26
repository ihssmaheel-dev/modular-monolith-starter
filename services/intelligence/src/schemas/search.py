from typing import Any

from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    id: str
    source_type: str
    source_id: str
    content: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)
