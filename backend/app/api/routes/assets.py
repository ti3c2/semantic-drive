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
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.security import generate_share_token, hash_share_token
from app.db.models import Asset, AssetExtraction, IngestionJob, Share
from app.db.session import get_db
from app.schemas.assets import AssetDetailOut, AssetOut, AssetUpdate, CreateShareIn, CreateShareOut
from app.services.media_probe import detect_media_type, guess_mime_type
from app.services.qdrant_index import delete_asset_points
from app.services.storage import fput_file, get_object_stream, remove_object
from app.services.taxonomy import get_folders, get_or_create_tags
from app.workers.enqueue import enqueue_asset_ingestion

settings = get_settings()
router = APIRouter(prefix="/api/assets", tags=["assets"])


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


def _stream_object(object_name: str, *, content_type: str, filename: str, attachment: bool) -> StreamingResponse:
    response = get_object_stream(object_name)

    def iterator():
        try:
            for chunk in response.stream(32 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    disposition_type = "attachment" if attachment else "inline"
    headers = {"Content-Disposition": f'{disposition_type}; filename="{filename}"'}
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
    asset = db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders), selectinload(Asset.extractions))
        .where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id)
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

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


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: UUID, body: AssetUpdate, db: Session = Depends(get_db)) -> AssetOut:
    asset = db.scalar(
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders))
        .where(Asset.id == asset_id, Asset.owner_id == settings.demo_owner_id)
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if body.display_title is not None:
        asset.display_title = body.display_title
    if body.description is not None:
        asset.description = body.description
    if body.tag_names is not None:
        asset.tags = get_or_create_tags(db, settings.demo_owner_id, body.tag_names)
    if body.folder_ids is not None:
        asset.folders = get_folders(db, settings.demo_owner_id, body.folder_ids)

    db.commit()
    db.refresh(asset)
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
