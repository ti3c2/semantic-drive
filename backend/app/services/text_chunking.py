from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.db.models import Asset, AssetExtraction


@dataclass(frozen=True)
class SearchChunk:
    asset_id: UUID
    extraction_id: UUID | None
    chunk_type: str
    chunk_index: int
    text: str
    start_ms: int | None = None
    end_ms: int | None = None


def chunk_text(text: str, *, chunk_size: int = 1600, overlap: int = 200) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        cut = text.rfind(". ", start, end)
        if cut > start + 400:
            end = cut + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return [chunk for chunk in chunks if chunk]


def chunks_for_asset(asset: Asset) -> list[SearchChunk]:
    output: list[SearchChunk] = []

    metadata_parts = [
        asset.display_title or asset.original_filename,
        asset.description or "",
        " ".join(tag.name for tag in asset.tags),
        " ".join(folder.name for folder in asset.folders),
    ]
    metadata_text = "\n".join(part for part in metadata_parts if part.strip())
    for idx, text in enumerate(chunk_text(metadata_text, chunk_size=1000, overlap=100)):
        output.append(
            SearchChunk(
                asset_id=asset.id,
                extraction_id=None,
                chunk_type="metadata",
                chunk_index=idx,
                text=text,
            )
        )

    for extraction in asset.extractions:
        output.extend(chunks_for_extraction(asset.id, extraction))
    return output


def chunks_for_extraction(asset_id: UUID, extraction: AssetExtraction) -> list[SearchChunk]:
    output: list[SearchChunk] = []
    for idx, text in enumerate(chunk_text(extraction.text)):
        output.append(
            SearchChunk(
                asset_id=asset_id,
                extraction_id=extraction.id,
                chunk_type=extraction.extraction_type,
                chunk_index=idx,
                text=text,
                start_ms=extraction.extra.get("start_ms") if extraction.extra else None,
                end_ms=extraction.extra.get("end_ms") if extraction.extra else None,
            )
        )
    return output
