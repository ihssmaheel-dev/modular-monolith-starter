from contextlib import asynccontextmanager
from typing import AsyncIterator
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from src.api.v1.router import api_v1_router
from src.core.exceptions import IntelligenceError
from src.core.logging import logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("Intelligence engine starting up...")
    yield
    logger.info("Intelligence engine shutting down...")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Intelligence Service",
        description="Autonomous Intelligence Engine for the modular monolith",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_v1_router)

    @app.exception_handler(IntelligenceError)
    async def handle_intelligence_error(
        request: Request, exc: IntelligenceError
    ) -> JSONResponse:
        logger.error(f"Domain exception: {exc.message}", extra={"code": exc.code})
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.message, "code": exc.code},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "Internal Intelligence Service Error", "code": "INTERNAL_ERROR"},
        )

    return app


app = create_app()
