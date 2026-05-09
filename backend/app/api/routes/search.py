from __future__ import annotations

import time
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.assets import asset_urls
from app.core.config import get_settings
from app.db.models import Asset, AssetChunk
from app.db.session import get_db
from app.schemas.search import MatchReason, SearchRequest, SearchResponse, SearchResult
from app.services.cohere_rerank import rerank
from app.services.embeddings import embed_texts
from app.services.qdrant_index import build_search_filter, query_points

settings = get_settings()
router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("", response_model=SearchResponse)
def search_assets(body: SearchRequest, db: Session = Depends(get_db)) -> SearchResponse:
    started = time.perf_counter()
    query_vector = embed_texts([body.query])[0]
    qdrant_filter = build_search_filter(
        owner_id=settings.demo_owner_id,
        media_types=body.filters.media_types,
        tags=body.filters.tags,
        folder_ids=body.filters.folder_ids,
    )
    points = query_points(query_vector, qdrant_filter, limit=max(body.limit * 6, 50))

    best_by_asset: dict[UUID, dict] = {}
    for point in points:
        payload = getattr(point, "payload", None) or {}
        if not payload.get("asset_id"):
            continue
        asset_id = UUID(payload["asset_id"])
        score = float(getattr(point, "score", 0.0) or 0.0)
        existing = best_by_asset.get(asset_id)
        if existing is None or score > existing["vector_score"]:
            best_by_asset[asset_id] = {
                "asset_id": asset_id,
                "vector_score": score,
                "chunk_type": payload.get("chunk_type") or "chunk",
                "text_preview": payload.get("text_preview") or "",
                "start_ms": payload.get("start_ms"),
                "end_ms": payload.get("end_ms"),
            }


    # Lightweight lexical boost/fallback. This keeps local dev usable when OpenAI keys are absent
    # and also helps exact OCR/transcript/title matches win instead of getting buried by vector vibes.
    like = f"%{body.query[:200]}%"
    lexical_chunks = db.scalars(
        select(AssetChunk)
        .join(Asset, AssetChunk.asset_id == Asset.id)
        .where(
            Asset.owner_id == settings.demo_owner_id,
            or_(
                AssetChunk.text.ilike(like),
                Asset.original_filename.ilike(like),
                Asset.display_title.ilike(like),
                Asset.description.ilike(like),
            ),
        )
        .limit(50)
    ).all()
    for chunk in lexical_chunks:
        existing = best_by_asset.get(chunk.asset_id)
        lexical_score = 1.0
        if existing is None or lexical_score > existing["vector_score"]:
            best_by_asset[chunk.asset_id] = {
                "asset_id": chunk.asset_id,
                "vector_score": lexical_score,
                "chunk_type": chunk.chunk_type,
                "text_preview": chunk.text[:500],
                "start_ms": chunk.start_ms,
                "end_ms": chunk.end_ms,
            }

    if not best_by_asset:
        return SearchResponse(query=body.query, took_ms=int((time.perf_counter() - started) * 1000), results=[])

    stmt = (
        select(Asset)
        .options(selectinload(Asset.tags), selectinload(Asset.folders))
        .where(Asset.owner_id == settings.demo_owner_id, Asset.id.in_(list(best_by_asset)))
    )
    if body.filters.media_types:
        stmt = stmt.where(Asset.media_type.in_(body.filters.media_types))
    if body.filters.date_from:
        stmt = stmt.where(Asset.created_at >= body.filters.date_from)
    if body.filters.date_to:
        stmt = stmt.where(Asset.created_at <= body.filters.date_to)

    assets = {asset.id: asset for asset in db.scalars(stmt).all()}
    candidates = [best_by_asset[asset_id] for asset_id in best_by_asset if asset_id in assets]
    candidates.sort(key=lambda item: item["vector_score"], reverse=True)
    candidates = candidates[: max(body.limit, 50)]

    rerank_scores: dict[UUID, float] = {}
    if body.rerank and settings.has_cohere and len(candidates) > 1:
        docs = []
        for item in candidates:
            asset = assets[item["asset_id"]]
            docs.append(
                "\n".join(
                    [
                        f"Title: {asset.display_title or asset.original_filename}",
                        f"Filename: {asset.original_filename}",
                        f"Description: {asset.description or ''}",
                        f"Media type: {asset.media_type}",
                        f"Tags: {', '.join(tag.name for tag in asset.tags)}",
                        f"Folders: {', '.join(folder.name for folder in asset.folders)}",
                        f"Best matching excerpt: {item['text_preview']}",
                    ]
                )
            )
        for hit in rerank(body.query, docs, top_n=min(body.limit, len(docs))):
            if 0 <= hit.index < len(candidates):
                rerank_scores[candidates[hit.index]["asset_id"]] = hit.score

    def final_score(item: dict) -> float:
        if item["asset_id"] in rerank_scores:
            return 0.7 * rerank_scores[item["asset_id"]] + 0.3 * item["vector_score"]
        return item["vector_score"]

    candidates.sort(key=final_score, reverse=True)
    results: list[SearchResult] = []
    for item in candidates[: body.limit]:
        asset = assets[item["asset_id"]]
        urls = asset_urls(asset)
        results.append(
            SearchResult(
                asset_id=asset.id,
                title=asset.display_title or asset.original_filename,
                original_filename=asset.original_filename,
                media_type=asset.media_type,
                mime_type=asset.mime_type,
                thumbnail_url=urls["thumbnail_url"],
                raw_url=urls["raw_url"],
                download_url=urls["download_url"],
                score=final_score(item),
                vector_score=item["vector_score"],
                rerank_score=rerank_scores.get(asset.id),
                match_reason=MatchReason(
                    type=item["chunk_type"],
                    text=item["text_preview"],
                    start_ms=item["start_ms"],
                    end_ms=item["end_ms"],
                ),
                tags=[tag.name for tag in asset.tags],
                created_at=asset.created_at,
            )
        )

    return SearchResponse(query=body.query, took_ms=int((time.perf_counter() - started) * 1000), results=results)
