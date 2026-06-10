from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SearchFilters(BaseModel):
    media_types: list[str] = []
    folder_ids: list[UUID] = []
    tags: list[str] = []
    date_from: datetime | None = None
    date_to: datetime | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    filters: SearchFilters = Field(default_factory=SearchFilters)
    limit: int = Field(default=30, ge=1, le=100)
    rerank: bool = True


class MatchReason(BaseModel):
    type: str
    text: str
    start_ms: int | None = None
    end_ms: int | None = None


class SearchResult(BaseModel):
    asset_id: UUID
    title: str
    original_filename: str
    media_type: str
    mime_type: str
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    thumbnail_url: str | None = None
    raw_url: str
    download_url: str
    score: float
    vector_score: float | None = None
    rerank_score: float | None = None
    match_reason: MatchReason
    tags: list[str] = []
    created_at: datetime


class SearchResponse(BaseModel):
    query: str
    took_ms: int
    results: list[SearchResult]
