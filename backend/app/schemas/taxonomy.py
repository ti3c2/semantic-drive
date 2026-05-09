from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_id: UUID | None = None


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_id: UUID | None = None


class FolderOut(BaseModel):
    id: UUID
    name: str
    parent_id: UUID | None = None

    model_config = {"from_attributes": True}


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TagOut(BaseModel):
    id: UUID
    name: str

    model_config = {"from_attributes": True}
