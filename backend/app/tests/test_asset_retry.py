from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes import assets
from app.db.models import Asset, IngestionJob


def make_asset(*, status: str = "failed") -> Asset:
    return Asset(
        id=uuid4(),
        owner_id=uuid4(),
        original_filename="clip.mp4",
        display_title="Clip",
        description=None,
        media_type="video",
        mime_type="video/mp4",
        file_size_bytes=123,
        sha256="0" * 64,
        storage_key="owners/demo/assets/clip.mp4",
        processing_status=status,
    )


def test_enqueue_processing_retry_marks_failed_asset_queued(monkeypatch) -> None:
    asset = make_asset()
    db = FakeDb()
    enqueued_ids = []

    monkeypatch.setattr(
        assets, "enqueue_asset_ingestion", lambda asset_id: enqueued_ids.append(asset_id)
    )

    assets._enqueue_processing_retry(asset, db)

    assert asset.processing_status == "queued"
    assert enqueued_ids == [asset.id]
    assert len(db.added) == 1
    assert isinstance(db.added[0], IngestionJob)
    assert db.added[0].status == "queued"
    assert db.added[0].current_step == "retry queued"
    assert db.commits == 1


def test_enqueue_processing_retry_rejects_non_failed_asset() -> None:
    asset = make_asset(status="processing")

    with pytest.raises(HTTPException) as exc_info:
        assets._enqueue_processing_retry(asset, FakeDb())

    assert exc_info.value.status_code == 409


def test_enqueue_processing_retry_restores_failed_state_when_enqueue_fails(monkeypatch) -> None:
    asset = make_asset()
    db = FakeDb()

    def fail_enqueue(_asset_id):
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(assets, "enqueue_asset_ingestion", fail_enqueue)

    with pytest.raises(HTTPException) as exc_info:
        assets._enqueue_processing_retry(asset, db)

    assert exc_info.value.status_code == 503
    assert asset.processing_status == "failed"
    assert db.added[0].status == "failed"
    assert db.added[0].error_message == "Failed to enqueue retry: redis unavailable"
    assert db.commits == 2


class FakeDb:
    def __init__(self) -> None:
        self.added = []
        self.commits = 0

    def add(self, item) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1
