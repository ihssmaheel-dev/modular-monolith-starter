from pydantic import BaseModel, Field


class TextChunk(BaseModel):
    text: str
    index: int
    charCount: int = Field(alias="char_count")


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[TextChunk]:
    """Splits a document into overlapping semantic chunks."""
    if not text.strip():
        return []

    if len(text) <= chunk_size:
        return [TextChunk(text=text.strip(), index=0, char_count=len(text.strip()))]

    chunks: list[TextChunk] = []
    start = 0
    index = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(TextChunk(text=chunk, index=index, char_count=len(chunk)))
            index += 1

        start += chunk_size - chunk_overlap

    return chunks
