from collections.abc import Awaitable, Callable

from fastapi import Request, Response, status

from config import settings
from errors import format_error_response


def resolve_max_request_bytes(path: str) -> int | None:
    """Resolve maximum allowed request bytes based on endpoint path."""
    if path.startswith("/api/v1/embeddings"):
        return settings.MAX_EMBEDDING_PAYLOAD_BYTES
    if path.startswith("/api/v1/chat"):
        return settings.MAX_UNARY_PAYLOAD_BYTES
    return None


def is_content_length_exceeded(request: Request, max_bytes: int) -> bool:
    """Check if the Content-Length header strictly exceeds the limit."""
    content_length = request.headers.get("content-length")
    if not content_length:
        return False
    try:
        return int(content_length) > max_bytes
    except ValueError:
        return False


async def stream_and_verify_body(request: Request, max_bytes: int) -> bytes | None:
    """
    Stream chunks and ensure total size does not exceed max_bytes.
    Returns the accumulated bytes or None if limit was violated.
    """
    chunks: list[bytes] = []
    total_bytes = 0
    async for chunk in request.stream():
        total_bytes += len(chunk)
        if total_bytes > max_bytes:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


def is_response_size_exceeded(response: Response, max_bytes: int) -> bool:
    """Check if response Content-Length exceeds allowable limit."""
    content_length = response.headers.get("content-length")
    if not content_length:
        return False
    try:
        return int(content_length) > max_bytes
    except ValueError:
        return False


async def payload_size_limit_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """
    Enforces request and response payload size limits.
    Streams request chunks incrementally to defeat missing/chunked Content-Length bypasses.
    """
    max_bytes = resolve_max_request_bytes(request.url.path)
    if max_bytes is not None:
        if is_content_length_exceeded(request, max_bytes):
            return format_error_response(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                code="AI_PAYLOAD_TOO_LARGE",
                i18n_key="intelligence.errors.payloadTooLarge",
                message=f"Request payload exceeds {max_bytes} byte limit",
                request=request,
            )

        body = await stream_and_verify_body(request, max_bytes)
        if body is None:
            return format_error_response(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                code="AI_PAYLOAD_TOO_LARGE",
                i18n_key="intelligence.errors.payloadTooLarge",
                message=f"Request payload exceeds {max_bytes} byte limit",
                request=request,
            )
        request._body = body

    response = await call_next(request)
    if is_response_size_exceeded(response, settings.MAX_RESPONSE_BYTES):
        return format_error_response(
            status_code=status.HTTP_502_BAD_GATEWAY,
            code="AI_SERVICE_UNAVAILABLE",
            i18n_key="intelligence.errors.unavailable",
            message=f"Response payload exceeds {settings.MAX_RESPONSE_BYTES} byte limit",
            request=request,
        )
    return response
