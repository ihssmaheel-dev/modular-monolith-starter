from src.rag.chunker import chunk_text
from src.rag.embeddings import cosine_similarity


def test_chunk_text_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_chunk_text_short():
    chunks = chunk_text("Hello world", chunk_size=100)
    assert len(chunks) == 1
    assert chunks[0].text == "Hello world"
    assert chunks[0].index == 0


def test_chunk_text_splits_large_text():
    text = "word " * 500  # 2500 chars
    chunks = chunk_text(text, chunk_size=400, chunk_overlap=50)
    assert len(chunks) > 1
    assert all(len(c.text) <= 400 for c in chunks)


def test_cosine_similarity_identical():
    v1 = [1.0, 2.0, 3.0]
    v2 = [1.0, 2.0, 3.0]
    sim = cosine_similarity(v1, v2)
    assert round(sim, 4) == 1.0


def test_cosine_similarity_orthogonal():
    v1 = [1.0, 0.0]
    v2 = [0.0, 1.0]
    sim = cosine_similarity(v1, v2)
    assert round(sim, 4) == 0.0


def test_cosine_similarity_empty():
    assert cosine_similarity([], []) == 0.0
