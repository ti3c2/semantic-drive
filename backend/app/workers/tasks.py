from __future__ import annotations

import shutil
import subprocess
import uuid
from pathlib import Path

from qdrant_client.http import models as qmodels
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.db.models import Asset, AssetChunk, AssetExtraction, IngestionJob
from app.db.session import SessionLocal
from app.services.embeddings import embed_texts
from app.services.events import publish_asset_event
from app.services.media_probe import probe_media
from app.services.openai_extract import (
    extract_audio_from_video,
    extract_image_text,
    split_audio_if_needed,
    transcribe_audio_file,
)
from app.services.qdrant_index import delete_asset_points, point_struct, upsert_points
from app.services.storage import fget_file, fput_file
from app.services.text_chunking import chunks_for_asset
from app.services.thumbnails import generate_thumbnail

settings = get_settings()


def _asset_work_dir(asset_id: str) -> Path:
    path = settings.tmp_dir / asset_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _set_status(db, asset: Asset, status: str, step: str | None = None, progress: int | None = None) -> None:
    asset.processing_status = status
    job = db.scalar(
        select(IngestionJob)
        .where(IngestionJob.asset_id == asset.id)
        .order_by(IngestionJob.created_at.desc())
        .limit(1)
    )
    if job:
        job.status = "done" if status == "ready" else "failed" if status == "failed" else "running"
        job.current_step = step
        if status == "failed":
            job.attempts += 1
    db.commit()
    publish_asset_event(asset.id, status, step, progress)


def _add_extraction(db, asset: Asset, extraction_type: str, text: str, extra: dict | None = None) -> None:
    text = (text or "").strip()
    if not text:
        return
    db.add(
        AssetExtraction(
            asset_id=asset.id,
            extraction_type=extraction_type,
            text=text,
            extra=extra or {},
        )
    )


def _transcribe_path(path: Path, work_dir: Path) -> str:
    chunks = split_audio_if_needed(path, work_dir / "audio_chunks")
    parts: list[str] = []
    for index, chunk in enumerate(chunks, start=1):
        text = transcribe_audio_file(chunk)
        if text.strip():
            parts.append(text.strip())
        publish_asset_event(uuid.UUID(work_dir.name), "transcribing", f"transcribed chunk {index}/{len(chunks)}", 45)
    return "\n\n".join(parts)


def process_asset(asset_id: str) -> None:
    asset_uuid = uuid.UUID(asset_id)
    work_dir = _asset_work_dir(asset_id)

    with SessionLocal() as db:
        asset = db.scalar(
            select(Asset)
            .options(selectinload(Asset.tags), selectinload(Asset.folders), selectinload(Asset.extractions))
            .where(Asset.id == asset_uuid)
        )
        if not asset:
            return

        try:
            _set_status(db, asset, "processing", "downloading original", 5)
            original_path = work_dir / asset.original_filename
            fget_file(asset.storage_key, original_path)

            _set_status(db, asset, "processing", "probing media", 15)
            media_info = probe_media(original_path, asset.media_type, asset.mime_type)
            asset.duration_ms = media_info.duration_ms
            asset.width = media_info.width
            asset.height = media_info.height
            db.commit()

            _set_status(db, asset, "processing", "generating thumbnail", 25)
            thumb_path = work_dir / "thumbnail.jpg"
            generate_thumbnail(original_path, asset.media_type, thumb_path, label=asset.original_filename)
            thumb_key = f"owners/{asset.owner_id}/assets/{asset.id}/thumbnail.jpg"
            fput_file(thumb_key, thumb_path, content_type="image/jpeg")
            asset.thumbnail_key = thumb_key
            db.commit()
            publish_asset_event(asset.id, "processing", "thumbnail ready", 30)

            _set_status(db, asset, "processing", "clearing previous index", 32)
            delete_asset_points(asset.id)
            db.execute(delete(AssetChunk).where(AssetChunk.asset_id == asset.id))
            db.execute(delete(AssetExtraction).where(AssetExtraction.asset_id == asset.id))
            db.commit()

            if asset.media_type == "image":
                _set_status(db, asset, "extracting", "running OCR and visual caption", 42)
                result = extract_image_text(original_path, asset.mime_type, asset.original_filename)
                _add_extraction(db, asset, "ocr", result.get("ocr_text", ""), extra={"source": "openai_vision"})
                visual_parts = [
                    result.get("visual_summary", ""),
                    " ".join(result.get("search_keywords") or []),
                    result.get("detected_document_type", ""),
                ]
                _add_extraction(
                    db,
                    asset,
                    "visual_caption",
                    "\n".join(part for part in visual_parts if part),
                    extra={"source": "openai_vision", "raw": result},
                )

            elif asset.media_type == "audio":
                _set_status(db, asset, "transcribing", "transcribing audio", 42)
                transcript = _transcribe_path(original_path, work_dir)
                _add_extraction(db, asset, "transcript", transcript, extra={"source": "openai_transcription"})

            elif asset.media_type == "video":
                _set_status(db, asset, "transcribing", "extracting audio from video", 38)
                audio_path = work_dir / "video-audio.mp3"
                try:
                    extract_audio_from_video(original_path, audio_path)
                    transcript = _transcribe_path(audio_path, work_dir)
                except subprocess.CalledProcessError:
                    transcript = "Video audio could not be extracted."
                _add_extraction(db, asset, "transcript", transcript, extra={"source": "openai_transcription"})

            db.commit()

            asset = db.scalar(
                select(Asset)
                .options(selectinload(Asset.tags), selectinload(Asset.folders), selectinload(Asset.extractions))
                .where(Asset.id == asset_uuid)
            )
            if not asset:
                return

            _set_status(db, asset, "embedding", "embedding searchable chunks", 68)
            chunks = chunks_for_asset(asset)
            texts = [chunk.text for chunk in chunks]
            vectors = embed_texts(texts)

            points: list[qmodels.PointStruct] = []
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
            _set_status(db, asset, "embedding", "upserting vectors", 86)
            upsert_points(points)

            _set_status(db, asset, "ready", "ready", 100)

        except Exception as exc:
            job = db.scalar(
                select(IngestionJob)
                .where(IngestionJob.asset_id == asset.id)
                .order_by(IngestionJob.created_at.desc())
                .limit(1)
            )
            if job:
                job.error_message = str(exc)
            asset.processing_status = "failed"
            db.commit()
            publish_asset_event(asset.id, "failed", str(exc), 0)
            raise
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)
