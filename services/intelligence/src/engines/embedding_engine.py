import logging

from fastembed import TextEmbedding

from config import settings
from security.pii import sanitize_pii

logger = logging.getLogger("intelligence.embedding")

_model: TextEmbedding | None = None


def get_embedding_model() -> TextEmbedding:
    """Lazy initialize the FastEmbed ONNX local embedding model."""
    global _model
    if _model is None:
        logger.info(f"Loading FastEmbed ONNX model '{settings.DEFAULT_EMBEDDING_MODEL}'...")
        _model = TextEmbedding(model_name=settings.DEFAULT_EMBEDDING_MODEL)
    return _model


def embed_text(text: str, *, already_sanitized: bool = False) -> list[float]:
    """
    Generate a 384-dimensional normalized dense embedding for a single text string.
    Applies PII sanitization prior to generation if enabled and not already sanitized.
    """
    should_sanitize = settings.PII_REDACTION_ENABLED and not already_sanitized
    processed = sanitize_pii(text) if should_sanitize else text
    model = get_embedding_model()
    embeddings = list(model.embed([processed]))
    return embeddings[0].tolist()


def embed_documents(texts: list[str], *, already_sanitized: bool = False) -> list[list[float]]:
    """
    Generate dense embeddings for a batch of text documents.
    Applies PII sanitization to all input texts prior to embedding if enabled.
    """
    should_sanitize = settings.PII_REDACTION_ENABLED and not already_sanitized
    processed = [sanitize_pii(t) if should_sanitize else t for t in texts]
    model = get_embedding_model()
    embeddings = list(model.embed(processed))
    return [e.tolist() for e in embeddings]
