from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.api.routes import search
from app.api.routes.search import _metadata_text
from app.db.models import Asset, Tag
from app.schemas.search import SearchRequest


def make_asset() -> Asset:
    owner_id = uuid4()
    asset = Asset(
        id=uuid4(),
        owner_id=owner_id,
        original_filename="clip.mp4",
        display_title="Launch clip",
        description="Short promo cut for the spring launch.",
        media_type="video",
        mime_type="video/mp4",
        file_size_bytes=123,
        sha256="0" * 64,
        storage_key="owners/demo/assets/clip.mp4",
        processing_status="queued",
        visibility="private",
        created_at=datetime.now(timezone.utc),
    )
    asset.tags = [
        Tag(id=uuid4(), owner_id=owner_id, name="promo"),
        Tag(id=uuid4(), owner_id=owner_id, name="spring"),
    ]
    asset.folders = []
    return asset


def test_metadata_text_includes_description_and_tags() -> None:
    asset = make_asset()
    text = _metadata_text(asset)

    assert "Launch clip" in text
    assert "Short promo cut" in text
    assert "Tags: promo, spring" in text


def test_search_returns_metadata_matches_without_embedding(monkeypatch) -> None:
    asset = make_asset()

    def fail_if_called(_texts):
        raise AssertionError("metadata matches should not require embeddings")

    monkeypatch.setattr(search, "embed_texts", fail_if_called)

    response = search.search_assets(
        SearchRequest(query="promo", limit=5, rerank=False),
        db=FakeDb(asset),
    )

    assert len(response.results) == 1
    assert response.results[0].asset_id == asset.id
    assert response.results[0].match_reason.type == "metadata"
    assert "Tags: promo, spring" in response.results[0].match_reason.text


class FakeScalarResult:
    def __init__(self, values: list):
        self.values = values

    def all(self) -> list:
        return self.values


class FakeDb:
    def __init__(self, asset: Asset):
        self.asset = asset
        self.calls = 0

    def scalars(self, _stmt) -> FakeScalarResult:
        self.calls += 1
        assert "assets.trashed_at IS NULL" in str(_stmt)
        if self.calls == 1:
            return FakeScalarResult([])
        return FakeScalarResult([self.asset])
