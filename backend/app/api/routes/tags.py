from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Tag
from app.db.session import get_db
from app.schemas.taxonomy import TagCreate, TagOut
from app.services.taxonomy import normalize_tag_name

settings = get_settings()
router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)) -> list[TagOut]:
    return list(
        db.scalars(
            select(Tag).where(Tag.owner_id == settings.demo_owner_id).order_by(Tag.name)
        ).all()
    )


@router.post("", response_model=TagOut, status_code=201)
def create_tag(body: TagCreate, db: Session = Depends(get_db)) -> TagOut:
    name = normalize_tag_name(body.name)
    existing = db.scalar(
        select(Tag).where(Tag.owner_id == settings.demo_owner_id, Tag.name == name)
    )
    if existing:
        return existing
    tag = Tag(owner_id=settings.demo_owner_id, name=name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: UUID, db: Session = Depends(get_db)) -> None:
    tag = db.scalar(select(Tag).where(Tag.id == tag_id, Tag.owner_id == settings.demo_owner_id))
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
