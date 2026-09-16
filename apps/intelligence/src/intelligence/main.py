import logging
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from opentelemetry import context as otel_context
from opentelemetry import propagate

from intelligence.api.errors.handlers import intelligence_error_handler, unexpected_error_handler
from intelligence.api.routes import health, internal
from intelligence.application.services.document_service import DocumentService
from intelligence.application.services.intelligence_service import IntelligenceApplicationService
from intelligence.config.settings import Settings, get_settings
from intelligence.domain.errors.errors import IntelligenceError
from intelligence.infrastructure.observability.logging import configure_logging
from intelligence.infrastructure.observability.telemetry import configure_tracing
from intelligence.infrastructure.providers.openai_compatible import OpenAICompatibleGateway


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    configure_logging(resolved.log_level)
    configure_tracing(str(resolved.otel_endpoint) if resolved.otel_endpoint else None)
    gateway = OpenAICompatibleGateway(resolved) if resolved.enabled else None

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
        yield
        if gateway:
            await gateway.close()

    app = FastAPI(
        title="Intelligence Internal Service",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_exception_handler(IntelligenceError, intelligence_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unexpected_error_handler)
    app.include_router(health.router)
    app.include_router(internal.router)

    async def request_size_guard(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        trace_context = propagate.extract(dict(request.headers))
        context_token = otel_context.attach(trace_context)
        content_length = request.headers.get("content-length")
        try:
            if content_length:
                try:
                    if int(content_length) > resolved.max_request_bytes:
                        return await _too_large_response()
                except ValueError:
                    return JSONResponse(status_code=400, content={"code": "INVALID_CONTENT_LENGTH"})
            return await call_next(request)
        finally:
            otel_context.detach(context_token)

    app.middleware("http")(request_size_guard)  # type: ignore[arg-type]

    if gateway:
        service = IntelligenceApplicationService(gateway, resolved)
        document_service = DocumentService(resolved)
        app.dependency_overrides[IntelligenceApplicationService] = lambda: service
        app.dependency_overrides[DocumentService] = lambda: document_service
    return app


async def _too_large_response() -> JSONResponse:
    return JSONResponse(status_code=413, content={"code": "REQUEST_TOO_LARGE"})


app = create_app()

if __name__ == "__main__":
    logging.getLogger(__name__).info("Use uvicorn to run the intelligence service")
