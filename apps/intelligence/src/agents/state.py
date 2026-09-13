from typing import Any
from pydantic import BaseModel, Field
from src.domain.models import ChatMessage


class AgentState(BaseModel):
    messages: list[ChatMessage]
    current_step: int = 0
    max_steps: int = 5
    is_finished: bool = False
    context: dict[str, Any] = Field(default_factory=dict)
    actions_taken: list[str] = Field(default_factory=list)
