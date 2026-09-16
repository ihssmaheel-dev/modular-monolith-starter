from dataclasses import dataclass

import httpx

from intelligence.config.settings import Settings
from intelligence.domain.errors.errors import BudgetExceededError
from intelligence.infrastructure.document_parsers.chunker import TextChunk, chunk_text
from intelligence.infrastructure.security.url_policy import assert_allowed_storage_url


@dataclass(frozen=True, slots=True)
class ParsedDocument:
    content_type: str
    chunks: tuple[TextChunk, ...]


class DocumentService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def parse_signed_object(self, signed_url: str) -> ParsedDocument:
        assert_allowed_storage_url(signed_url, self.settings.allowed_storage_hosts)
        timeout = httpx.Timeout(self.settings.request_timeout_seconds)
        async with (
            httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client,
            client.stream("GET", signed_url) as response,
        ):
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > self.settings.max_document_bytes:
                        raise BudgetExceededError("Document exceeds the configured byte limit")
                except ValueError as error:
                    raise ValueError("Storage response has an invalid content length") from error
            body = bytearray()
            async for part in response.aiter_bytes():
                body.extend(part)
                if len(body) > self.settings.max_document_bytes:
                    raise BudgetExceededError("Document exceeds the configured byte limit")
        content_type = response.headers.get("content-type", "text/plain").split(";", 1)[0]
        if content_type not in {"text/plain", "text/markdown", "text/csv", "application/json"}:
            raise ValueError("Only text documents are supported by the foundation parser")
        text = body.decode("utf-8", errors="strict")
        chunks = chunk_text(text, max_chars=4_000, max_chunks=self.settings.max_chunks)
        return ParsedDocument(content_type=content_type, chunks=chunks)
