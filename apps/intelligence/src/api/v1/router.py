from fastapi import APIRouter
from src.api.v1.health import router as health_router
from src.api.v1.chat import router as chat_router
from src.api.v1.embeddings import router as embeddings_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(health_router)
api_v1_router.include_router(chat_router)
api_v1_router.include_router(embeddings_router)
