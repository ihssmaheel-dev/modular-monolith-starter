import hashlib
import re
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TextChunk:
    ordinal: int
    content: str
    content_hash: str


def chunk_text(text: str, *, max_chars: int, max_chunks: int) -> tuple[TextChunk, ...]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return ()
    if len(normalized) > max_chars * max_chunks:
        raise ValueError("Document exceeds the configured chunk limit")
    chunks: list[TextChunk] = []
    current: list[str] = []
    current_length = 0
    for word in normalized.split(" "):
        next_length = current_length + (1 if current else 0) + len(word)
        if current and next_length > max_chars:
            content = " ".join(current)
            chunks.append(
                TextChunk(
                    ordinal=len(chunks),
                    content=content,
                    content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
                )
            )
            if len(chunks) >= max_chunks:
                raise ValueError("Document exceeds the configured chunk limit")
            current = []
            current_length = 0
        current.append(word)
        current_length += (1 if current_length else 0) + len(word)
    if current:
        content = " ".join(current)
        chunks.append(
            TextChunk(
                ordinal=len(chunks),
                content=content,
                content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            )
        )
    return tuple(chunks)
