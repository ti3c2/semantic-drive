from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.api.routes import assets
from app.db.models import Asset, AssetChunk, AssetExtraction, Tag
from app.schemas.assets import AssetUpdate


def make_asset(*, status: str = "ready") -> Asset:
    owner_id = uuid4()
    now = datetime.now(timezone.utc)
    asset = Asset(
        id=uuid4(),
        owner_id=owner_id,
        original_filename="scan.jpg",
        display_title="Original scan",
        description="Original description",
        media_type="image",
        mime_type="image/jpeg",
        file_size_bytes=123,
        sha256="0" * 64,
        storage_key="owners/demo/assets/scan.jpg",
        processing_status=status,
        visibility="private",
        created_at=now,
        updated_at=now,
    )
    asset.tags = [Tag(id=uuid4(), owner_id=owner_id, name="old")]
    asset.folders = []
    asset.extractions = []
    return asset


def test_update_asset_refreshes_search_index_for_metadata_changes(monkeypatch) -> None:
    asset = make_asset()
    db = FakeRouteDb(asset)
    reindexed = []
    new_tags = [Tag(id=uuid4(), owner_id=asset.owner_id, name="fresh")]

    monkeypatch.setattr(assets, "get_or_create_tags", lambda *_args: new_tags)
    monkeypatch.setattr(
        assets,
        "_reindex_asset_search",
        lambda item, _db, previous_status: reindexed.append((item.id, previous_status)),
    )

    result = assets.update_asset(
        asset.id,
        AssetUpdate(description="Fresh searchable description", tag_names=["fresh"]),
        db,
    )

    assert result.description == "Fresh searchable description"
    assert [tag.name for tag in asset.tags] == ["fresh"]
    assert reindexed == [(asset.id, "ready")]


def test_delete_asset_extraction_removes_detail_text_before_reindex(monkeypatch) -> None:
    asset = make_asset()
    extraction = AssetExtraction(
        id=uuid4(),
        asset_id=asset.id,
        extraction_type="ocr",
        text="bad noisy OCR",
        extra={},
    )
    asset.extractions = [extraction]
    db = FakeRouteDb(asset)
    reindexed_extraction_types = []

    monkeypatch.setattr(
        assets,
        "_reindex_asset_search",
        lambda item, _db, _previous_status: reindexed_extraction_types.append(
            [extraction.extraction_type for extraction in item.extractions]
        ),
    )

    result = assets.delete_asset_extraction(asset.id, "ocr", db)

    assert result.ocr_text is None
    assert result.extractions == []
    assert asset.extractions == []
    assert db.deleted == [extraction]
    assert reindexed_extraction_types == [[]]


def test_delete_asset_moves_to_trash_without_removing_storage(monkeypatch) -> None:
    asset = make_asset()
    asset.thumbnail_key = "owners/demo/assets/scan-thumb.jpg"
    asset.preview_key = "owners/demo/assets/scan-preview.jpg"
    db = FakeRouteDb(asset)
    deleted_asset_ids = []
    removed_objects = []

    monkeypatch.setattr(
        assets, "delete_asset_points", lambda asset_id: deleted_asset_ids.append(asset_id)
    )
    monkeypatch.setattr(assets, "remove_object", lambda key: removed_objects.append(key))

    assets.delete_asset(asset.id, db)

    assert asset.trashed_at is not None
    assert deleted_asset_ids == [asset.id]
    assert removed_objects == []
    assert db.deleted == []
    assert db.commits == 1


def test_restore_asset_clears_trash_and_reindexes_ready_asset(monkeypatch) -> None:
    asset = make_asset()
    asset.trashed_at = datetime.now(timezone.utc)
    db = FakeRouteDb(asset)
    reindexed = []

    monkeypatch.setattr(
        assets,
        "_reindex_asset_search",
        lambda item, _db, previous_status: reindexed.append((item.id, previous_status)),
    )

    result = assets.restore_asset(asset.id, db)

    assert result.trashed_at is None
    assert asset.trashed_at is None
    assert reindexed == [(asset.id, "ready")]


def test_purge_asset_removes_trashed_asset_storage_and_row(monkeypatch) -> None:
    asset = make_asset()
    asset.trashed_at = datetime.now(timezone.utc)
    asset.thumbnail_key = "owners/demo/assets/scan-thumb.jpg"
    asset.preview_key = "owners/demo/assets/scan-preview.jpg"
    db = FakeRouteDb(asset)
    deleted_asset_ids = []
    removed_objects = []

    monkeypatch.setattr(
        assets, "delete_asset_points", lambda asset_id: deleted_asset_ids.append(asset_id)
    )
    monkeypatch.setattr(assets, "remove_object", lambda key: removed_objects.append(key))

    assets.purge_asset(asset.id, db)

    assert deleted_asset_ids == [asset.id]
    assert removed_objects == [
        asset.storage_key,
        asset.thumbnail_key,
        asset.preview_key,
    ]
    assert db.deleted == [asset]
    assert db.commits == 1


def test_reindex_asset_search_rebuilds_chunks_and_publishes_progress(monkeypatch) -> None:
    asset = make_asset()
    asset.extractions = [
        AssetExtraction(
            id=uuid4(),
            asset_id=asset.id,
            extraction_type="visual_caption",
            text="useful generated summary",
            extra={},
        )
    ]
    db = FakeIndexDb()
    deleted_asset_ids = []
    embedded_texts = []
    upserted_batches = []
    published_statuses = []

    def fake_embed_texts(texts):
        batch = list(texts)
        embedded_texts.extend(batch)
        return [[0.1, 0.2, 0.3] for _text in batch]

    monkeypatch.setattr(
        assets, "delete_asset_points", lambda asset_id: deleted_asset_ids.append(asset_id)
    )
    monkeypatch.setattr(assets, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(assets, "point_struct", lambda **kwargs: kwargs)
    monkeypatch.setattr(assets, "upsert_points", lambda points: upserted_batches.append(points))
    monkeypatch.setattr(
        assets,
        "publish_asset_event",
        lambda _asset_id, status, _step, _progress: published_statuses.append(status),
    )

    assets._reindex_asset_search(asset, db, "ready")

    assert asset.processing_status == "ready"
    assert deleted_asset_ids == [asset.id]
    assert any(isinstance(item, AssetChunk) for item in db.added)
    assert any("Original description" in text for text in embedded_texts)
    assert any("useful generated summary" in text for text in embedded_texts)
    assert len(upserted_batches) == 1
    assert published_statuses == ["embedding", "ready"]


class FakeRouteDb:
    def __init__(self, asset: Asset) -> None:
        self.asset = asset
        self.deleted = []
        self.flushes = 0
        self.commits = 0

    def scalar(self, _stmt):
        return self.asset

    def delete(self, item) -> None:
        self.deleted.append(item)

    def flush(self) -> None:
        self.flushes += 1

    def commit(self) -> None:
        self.commits += 1


class FakeIndexDb:
    def __init__(self) -> None:
        self.added = []
        self.commits = 0
        self.rollbacks = 0
        self.executed = []

    def add(self, item) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1

    def execute(self, statement) -> None:
        self.executed.append(statement)
