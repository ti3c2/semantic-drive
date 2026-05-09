from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Folder, Tag


def normalize_tag_name(name: str) -> str:
    return name.strip().lower().replace("#", "")[:100]


def get_or_create_tags(db: Session, owner_id: UUID, tag_names: list[str]) -> list[Tag]:
    output: list[Tag] = []
    seen: set[str] = set()
    for raw in tag_names:
        name = normalize_tag_name(raw)
        if not name or name in seen:
            continue
        seen.add(name)
        tag = db.scalar(select(Tag).where(Tag.owner_id == owner_id, Tag.name == name))
        if not tag:
            tag = Tag(owner_id=owner_id, name=name)
            db.add(tag)
            db.flush()
        output.append(tag)
    return output


def get_folders(db: Session, owner_id: UUID, folder_ids: list[UUID]) -> list[Folder]:
    if not folder_ids:
        return []
    return list(db.scalars(select(Folder).where(Folder.owner_id == owner_id, Folder.id.in_(folder_ids))).all())
