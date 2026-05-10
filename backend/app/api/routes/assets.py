from __future__ import annotations

import hashlib
import mimetypes
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.api.http_headers import content_disposition_header
from app.core.config import get_settings
from app.core.security import generate_share_token, hash_share_token
from app.db.models import Asset, AssetChunk, IngestionJob, Share
from app.db.session import get_db
from app.schemas.assets import AssetDetailOut, AssetOut, AssetUpdate, CreateShareIn, CreateShareOut
from app.services.embeddings import embed_texts
from app.services.events import publish_asset_event
from app.services.media_probe import detect_media_type, guess_mime_type
from app.services.qdrant_index import delete_asset_points, point_struct, upsert_points
from app.services.storage import fput_file, get_object_stream, remove_object
from app.services.taxonomy import get_folders, get_or_create_tags
from app.services.text_chunking import chunks_for_asset
from app.workers.enqueue import enqueue_asset_ingestion

settings = get_settings()
router = APIRouter(prefix="/api/assets", tags=["assets"])

EXTRACTION_TYPE_ALIASES = {
    "visual_summary": "visual_caption",
    "visual_caption": "visual_caption",
    "ocr": "ocr",
    "transcript": "transcript",
}


def _safe_filename(filename: str | None) -> str:
    filename = Path(filename or "upload.bin").name
    return filename.replace("/", "_").replace("\\", "_") or "upload.bin"


def _parse_tag_names(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_uuid_csv(raw: str | None) -> list[UUID]:
    if not raw:
        return []
    output = []
    for item in raw.split(","):
        item = item.strip()
        if item:
            output.append(UUID(item))
    return output


def asset_urls(asset: Asset) -> dict[str, str | None]:
    return {
        "thumbnail_url": f"/api/assets/{asset.id}/thumbnail" if asset.thumbnail_key else None,
        "raw_url": f"/api/assets/{asset.id}/raw",
        "download_url": f"/api/assets/{asset.id}/download",
    }


def serialize_asset(asset: Asset) -> AssetOut:
    return AssetOut.model_validate({**asset.__dict__, **asset_urls(asset), "folders": asset.folders, "tags": asset.tags})


def serialize_asset_detail(asset: Asset) -> AssetDetailOut:
    extraction_map = {item.extraction_type: item.text for item in asset.extractions}
    return AssetDetailOut.model_validate(
        {
            **asset.__dict__,
            **asset_urls(asset),
            "folders": asset.folders,
            "tags": asset.tags,
            "ocr_text": extraction_map.get("ocr"),
            "visual_summary": extraction_map.get("visual_caption"),
            "transcript": extraction_map.get("transcript"),
            "extractions": [
                {"id": str(item.id), "type": item.extraction_type, "text": item.text, "extra": item.extra}
                for item in asset.extractions
            ],
        }
    )


def _load_asset_detail(asset_id: UUID, db: Session) -> Asset | None:
    return db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders), selectinload(Asset.extractions))
        .where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id)
    )


def _set_asset_processing_status(
    asset: Asset,
    db: Session,
    status: str,
    step: str,
    progress: int,
) -> None:
    asset.processing_status = status
    db.commit()
    publish_asset_event(asset.id, status, step, progress)


def _final_reindex_status(previous_status: str) -> str:
    return "failed" if previous_status == "failed" else "ready"


def _reindex_asset_search(asset: Asset, db: Session, previous_status: str) -> None:
    _set_asset_processing_status(asset, db, "embedding", "refreshing search index", 72)
    try:
        delete_asset_points(asset.id)
        db.execute(delete(AssetChunk).where(AssetChunk.asset_id == asset.id))

        chunks = chunks_for_asset(asset)
        vectors = embed_texts(chunk.text for chunk in chunks)
        points = []
        for chunk, vector in zip(chunks, vectors, strict=False):
            chunk_id = uuid.uuid4()
            point_id = uuid.uuid4()
            db.add(
                AssetChunk(
                    id=chunk_id,
                    asset_id=asset.id,
                    extraction_id=chunk.extraction_id,
                    qdrant_point_id=point_id,
                    chunk_type=chunk.chunk_type,
                    chunk_index=chunk.chunk_index,
                    text=chunk.text,
                    start_ms=chunk.start_ms,
                    end_ms=chunk.end_ms,
                )
            )
            points.append(
                point_struct(
                    point_id=point_id,
                    vector=vector,
                    payload={
                        "owner_id": str(asset.owner_id),
                        "asset_id": str(asset.id),
                        "chunk_id": str(chunk_id),
                        "media_type": asset.media_type,
                        "chunk_type": chunk.chunk_type,
                        "folder_ids": [str(folder.id) for folder in asset.folders],
                        "tags": [tag.name for tag in asset.tags],
                        "created_at": asset.created_at.isoformat() if asset.created_at else None,
                        "start_ms": chunk.start_ms,
                        "end_ms": chunk.end_ms,
                        "text_preview": chunk.text[:500],
                    },
                )
            )

        db.commit()
        upsert_points(points)
        _set_asset_processing_status(
            asset,
            db,
            _final_reindex_status(previous_status),
            "search index refreshed",
            100,
        )
    except Exception as exc:
        db.rollback()
        asset.processing_status = previous_status
        db.commit()
        publish_asset_event(asset.id, previous_status, f"search refresh failed: {exc}", 0)
        raise HTTPException(status_code=503, detail="Metadata saved, but search refresh failed") from exc


def _enqueue_processing_retry(asset: Asset, db: Session) -> None:
    if asset.processing_status != "failed":
        raise HTTPException(status_code=409, detail="Only failed assets can be retried")

    asset.processing_status = "queued"
    retry_job = IngestionJob(asset_id=asset.id, status="queued", current_step="retry queued")
    db.add(retry_job)
    db.commit()

    try:
        enqueue_asset_ingestion(asset.id)
    except Exception as exc:
        asset.processing_status = "failed"
        retry_job.status = "failed"
        retry_job.error_message = f"Failed to enqueue retry: {exc}"
        db.commit()
        raise HTTPException(status_code=503, detail="Failed to enqueue retry") from exc


def _stream_object(object_name: str, *, content_type: str, filename: str, attachment: bool) -> StreamingResponse:
    response = get_object_stream(object_name)

    def iterator():
        try:
            for chunk in response.stream(32 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    headers = {"Content-Disposition": content_disposition_header(filename, attachment=attachment)}
    return StreamingResponse(iterator(), media_type=content_type, headers=headers)


@router.post("", response_model=AssetOut, status_code=201)
async def upload_asset(
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    description: Annotated[str | None, Form()] = None,
    tag_names: Annotated[str | None, Form()] = None,
    folder_ids: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
) -> AssetOut:
    filename = _safe_filename(file.filename)
    mime_type = guess_mime_type(filename, file.content_type)
    try:
        media_type = detect_media_type(filename, mime_type)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    asset_id = uuid.uuid4()
    upload_dir = settings.tmp_dir / "uploads" / str(asset_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = upload_dir / filename

    sha = hashlib.sha256()
    size = 0
    with tmp_path.open("wb") as handle:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > settings.max_upload_bytes:
                raise HTTPException(status_code=413, detail=f"Upload exceeds {settings.max_upload_mb} MB")
            sha.update(chunk)
            handle.write(chunk)

    storage_key = f"owners/{settings.demo_owner_id}/assets/{asset_id}/original/{filename}"
    fput_file(storage_key, tmp_path, content_type=mime_type)

    asset = Asset(
        id=asset_id,
        owner_id=settings.demo_owner_id,
        original_filename=filename,
        display_title=title or filename,
        description=description,
        media_type=media_type,
        mime_type=mime_type,
        file_size_bytes=size,
        sha256=sha.hexdigest(),
        storage_key=storage_key,
        processing_status="queued",
    )
    asset.tags = get_or_create_tags(db, settings.demo_owner_id, _parse_tag_names(tag_names))
    asset.folders = get_folders(db, settings.demo_owner_id, _parse_uuid_csv(folder_ids))
    db.add(asset)
    db.add(IngestionJob(asset_id=asset.id, status="queued", current_step="queued"))
    db.commit()
    db.refresh(asset)

    try:
        enqueue_asset_ingestion(asset.id)
    except Exception as exc:
        asset.processing_status = "failed"
        job = db.scalar(select(IngestionJob).where(IngestionJob.asset_id == asset.id).order_by(IngestionJob.created_at.desc()).limit(1))
        if job:
            job.status = "failed"
            job.error_message = f"Failed to enqueue worker: {exc}"
        db.commit()

    asset = db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders))
        .where(Asset.id == asset.id)
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return serialize_asset(asset)


@router.get("", response_model=list[AssetOut])
def list_assets(
    db: Session = Depends(get_db),
    media_type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[AssetOut]:
    stmt = (
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders))
        .where(Asset.owner_id == settings.demo_owner_id)
        .order_by(Asset.created_at.desc())
        .limit(limit)
    )
    if media_type:
        stmt = stmt.where(Asset.media_type == media_type)
    if q:
        stmt = stmt.where(Asset.original_filename.ilike(f"%{q}%"))
    return [serialize_asset(asset) for asset in db.scalars(stmt).all()]


@router.get("/{asset_id}", response_model=AssetDetailOut)
def get_asset(asset_id: UUID, db: Session = Depends(get_db)) -> AssetDetailOut:
    asset = _load_asset_detail(asset_id, db)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return serialize_asset_detail(asset)


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: UUID, body: AssetUpdate, db: Session = Depends(get_db)) -> AssetOut:
    asset = db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders), selectinload(Asset.extractions))
        .where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id)
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    previous_status = asset.processing_status
    should_refresh_index = False
    if body.display_title is not None:
        asset.display_title = body.display_title
        should_refresh_index = True
    if body.description is not None:
        asset.description = body.description
        should_refresh_index = True
    if body.tag_names is not None:
        asset.tags = get_or_create_tags(db, settings.demo_owner_id, body.tag_names)
        should_refresh_index = True
    if body.folder_ids is not None:
        asset.folders = get_folders(db, settings.demo_owner_id, body.folder_ids)
        should_refresh_index = True

    if should_refresh_index and previous_status in {"ready", "failed"}:
        _reindex_asset_search(asset, db, previous_status)
    else:
        db.commit()
    asset = db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders))
        .where(Asset.id == asset.id)
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return serialize_asset(asset)


@router.delete("/{asset_id}/extractions/{extraction_type}", response_model=AssetDetailOut)
def delete_asset_extraction(
    asset_id: UUID,
    extraction_type: str,
    db: Session = Depends(get_db),
) -> AssetDetailOut:
    resolved_type = EXTRACTION_TYPE_ALIASES.get(extraction_type)
    if not resolved_type:
        raise HTTPException(status_code=404, detail="Extraction not found")

    asset = _load_asset_detail(asset_id, db)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    previous_status = asset.processing_status
    matching = [item for item in asset.extractions if item.extraction_type == resolved_type]
    if not matching:
        raise HTTPException(status_code=404, detail="Extraction not found")

    for extraction in matching:
        asset.extractions.remove(extraction)
        db.delete(extraction)
    db.flush()

    if previous_status in {"ready", "failed"}:
        _reindex_asset_search(asset, db, previous_status)
    else:
        db.commit()

    asset = _load_asset_detail(asset_id, db)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return serialize_asset_detail(asset)


@router.post("/{asset_id}/retry", response_model=AssetOut)
def retry_asset_processing(asset_id: UUID, db: Session = Depends(get_db)) -> AssetOut:
    asset = db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders))
        .where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id)
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    _enqueue_processing_retry(asset, db)

    asset = db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders))
        .where(Asset.id == asset.id)
    )
    return serialize_asset(asset)


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: UUID, db: Session = Depends(get_db)) -> None:
    asset = db.scalar(select(Asset).where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    delete_asset_points(asset.id)
    remove_object(asset.storage_key)
    remove_object(asset.thumbnail_key)
    remove_object(asset.preview_key)
    db.delete(asset)
    db.commit()


@router.get("/{asset_id}/thumbnail")
def get_thumbnail(asset_id: UUID, db: Session = Depends(get_db)) -> StreamingResponse:
    asset = db.scalar(select(Asset).where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id))
    if not asset or not asset.thumbnail_key:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return _stream_object(asset.thumbnail_key, content_type="image/jpeg", filename="thumbnail.jpg", attachment=False)


@router.get("/{asset_id}/raw")
def get_raw_asset(asset_id: UUID, db: Session = Depends(get_db)) -> StreamingResponse:
    asset = db.scalar(select(Asset).where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _stream_object(asset.storage_key, content_type=asset.mime_type, filename=asset.original_filename, attachment=False)


@router.get("/{asset_id}/download")
def download_asset(asset_id: UUID, db: Session = Depends(get_db)) -> StreamingResponse:
    asset = db.scalar(select(Asset).where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    content_type = mimetypes.guess_type(asset.original_filename)[0] or asset.mime_type
    return _stream_object(asset.storage_key, content_type=content_type, filename=asset.original_filename, attachment=True)


@router.post("/{asset_id}/shares", response_model=CreateShareOut)
def create_share(asset_id: UUID, body: CreateShareIn, db: Session = Depends(get_db)) -> CreateShareOut:
    asset = db.scalar(select(Asset).where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    token = generate_share_token()
    expires_at = None
    if body.expires_in_seconds:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=body.expires_in_seconds)

    share = Share(
        asset_id=asset.id,
        owner_id=asset.owner_id,
        token_hash=hash_share_token(token),
        allow_download=body.allow_download,
        expires_at=expires_at,
    )
    asset.visibility = "link"
    db.add(share)
    db.commit()
    db.refresh(share)

    share_url = f"{settings.api_base_url}/s/{token}"
    raw_url = f"{settings.api_base_url}/s/{token}/raw"
    download_url = f"{settings.api_base_url}/s/{token}/download"
    return CreateShareOut(
        share_id=share.id,
        share_url=share_url,
        raw_url=raw_url,
        download_url=download_url,
        embed={
            "image": f'<img src="{raw_url}" alt="{asset.display_title or asset.original_filename}" />',
            "video": f'<video controls src="{raw_url}"></video>',
            "audio": f'<audio controls src="{raw_url}"></audio>',
            "iframe": f'<iframe src="{settings.api_base_url}/embed/{token}" loading="lazy"></iframe>',
        },
    )
