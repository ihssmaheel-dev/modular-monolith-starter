from fastapi import APIRouter, Depends
from src.core.security import verify_internal_token
from src.domain.models import EmbeddingRequest, EmbeddingResponse
from src.providers.gateway import gateway

router = APIRouter(prefix="/embeddings", tags=["Embeddings"])


@router.post("", response_model=EmbeddingResponse, dependencies=[Depends(verify_internal_token)])
async def create_embeddings(request: EmbeddingRequest) -> EmbeddingResponse:
    """Generates dense vector embeddings for provided texts."""
    return await gateway.embed(request)
