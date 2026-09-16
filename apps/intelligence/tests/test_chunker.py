from intelligence.infrastructure.document_parsers.chunker import chunk_text


def test_chunker_normalizes_whitespace_and_hashes_chunks() -> None:
    chunks = chunk_text("one   two\nthree", max_chars=7, max_chunks=4)

    assert [chunk.content for chunk in chunks] == ["one two", "three"]
    assert all(len(chunk.content_hash) == 64 for chunk in chunks)


def test_chunker_enforces_chunk_limit() -> None:
    try:
        chunk_text("abcdefghij", max_chars=2, max_chunks=2)
    except ValueError as error:
        assert "chunk limit" in str(error)
    else:
        raise AssertionError("expected chunk limit error")
