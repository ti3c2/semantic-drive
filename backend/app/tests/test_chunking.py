from app.services.text_chunking import chunk_text


def test_chunk_text_short():
    assert chunk_text("hello world") == ["hello world"]


def test_chunk_text_long():
    text = "sentence. " * 500
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    assert len(chunks) > 1
    assert all(chunk for chunk in chunks)
