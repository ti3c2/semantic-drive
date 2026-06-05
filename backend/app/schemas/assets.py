from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FolderOut(BaseModel):
    id: UUID
    name: str
    parent_id: UUID | None = None

    model_config = {"from_attributes": True}


class TagOut(BaseModel):
    id: UUID
    name: str

    model_config = {"from_attributes": True}


class AssetOut(BaseModel):
    id: UUID
    original_filename: str
    display_title: str | None = None
    description: str | None = None
    media_type: str
    mime_type: str
    file_size_bytes: int
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None
    processing_status: str
    visibility: str
    trashed_at: datetime | None = None
    thumbnail_url: str | None = None
    raw_url: str
    download_url: str
    folders: list[FolderOut] = []
    tags: list[TagOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssetDetailOut(AssetOut):
    ocr_text: str | None = None
    visual_summary: str | None = None
    transcript: str | None = None
    extractions: list[dict] = []


class AssetUpdate(BaseModel):
    display_title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    tag_names: list[str] | None = None
    folder_ids: list[UUID] | None = None


class CreateShareIn(BaseModel):
    expires_in_seconds: int | None = Field(default=None, gt=0)
    allow_download: bool = True


class CreateShareOut(BaseModel):
    share_id: UUID
    share_url: str
    raw_url: str
    download_url: str
    embed: dict[str, str]
