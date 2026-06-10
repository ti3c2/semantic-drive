from uuid import uuid4

from app.db.models import Asset, Tag
from app.services.text_chunking import chunk_text, chunks_for_asset


def test_chunk_text_short():
    assert chunk_text("hello world") == ["hello world"]


def test_chunk_text_long():
    text = "sentence. " * 500
    chunks = chunk_text(text, chunk_size=300, overlap=50)
    assert len(chunks) > 1
    assert all(chunk for chunk in chunks)


def test_chunks_for_asset_includes_description_and_tags():
    owner_id = uuid4()
    asset = Asset(
        id=uuid4(),
        owner_id=owner_id,
        original_filename="scan.jpg",
        display_title="January receipt",
        description="Warranty paperwork for the studio monitor.",
        media_type="image",
        mime_type="image/jpeg",
        file_size_bytes=123,
        sha256="0" * 64,
        storage_key="owners/demo/assets/scan.jpg",
        processing_status="queued",
    )
    asset.tags = [
        Tag(id=uuid4(), owner_id=owner_id, name="warranty"),
        Tag(id=uuid4(), owner_id=owner_id, name="studio"),
    ]
    asset.folders = []
    asset.extractions = []

    metadata_chunks = [chunk for chunk in chunks_for_asset(asset) if chunk.chunk_type == "metadata"]

    assert len(metadata_chunks) == 1
    assert "Warranty paperwork" in metadata_chunks[0].text
    assert "warranty studio" in metadata_chunks[0].text
