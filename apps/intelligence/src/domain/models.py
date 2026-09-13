from enum import Enum
from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    name: str | None = None


class TokenUsage(BaseModel):
    promptTokens: int = Field(default=0, ge=0)
    completionTokens: int = Field(default=0, ge=0)
    totalTokens: int = Field(default=0, ge=0)


class FinishReason(str, Enum):
    STOP = "stop"
    LENGTH = "length"
    TOOL_CALLS = "tool_calls"
    ERROR = "error"


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: str | None = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    maxTokens: int | None = Field(default=None, gt=0)
    stream: bool = False
    tenantId: str | None = None


class ChatResponse(BaseModel):
    message: ChatMessage
    finishReason: FinishReason = FinishReason.STOP
    model: str
    usage: TokenUsage
    latencyMs: float


class StreamChunkType(str, Enum):
    TOKEN = "token"
    TOOL_CALL = "tool_call"
    DONE = "done"
    ERROR = "error"


class StreamChunk(BaseModel):
    type: StreamChunkType
    content: str | None = None
    seq: int | None = None
    usage: TokenUsage | None = None
    error: str | None = None


class EmbeddingRequest(BaseModel):
    input: str | list[str]
    model: str | None = None


class EmbeddingResponseUsage(BaseModel):
    promptTokens: int = 0
    totalTokens: int = 0


class EmbeddingResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    usage: EmbeddingResponseUsage
    latencyMs: float
