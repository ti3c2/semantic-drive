from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Folder
from app.db.session import get_db
from app.schemas.taxonomy import FolderCreate, FolderOut, FolderUpdate

settings = get_settings()
router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("", response_model=list[FolderOut])
def list_folders(db: Session = Depends(get_db)) -> list[FolderOut]:
    return list(db.scalars(select(Folder).where(Folder.owner_id == settings.demo_owner_id).order_by(Folder.name)).all())


@router.post("", response_model=FolderOut, status_code=201)
def create_folder(body: FolderCreate, db: Session = Depends(get_db)) -> FolderOut:
    folder = Folder(owner_id=settings.demo_owner_id, name=body.name.strip(), parent_id=body.parent_id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.patch("/{folder_id}", response_model=FolderOut)
def update_folder(folder_id: UUID, body: FolderUpdate, db: Session = Depends(get_db)) -> FolderOut:
    folder = db.scalar(select(Folder).where(Folder.id == folder_id, Folder.owner_id == settings.demo_owner_id))
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if body.name is not None:
        folder.name = body.name.strip()
    if body.parent_id is not None:
        folder.parent_id = body.parent_id
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=204)
def delete_folder(folder_id: UUID, db: Session = Depends(get_db)) -> None:
    folder = db.scalar(select(Folder).where(Folder.id == folder_id, Folder.owner_id == settings.demo_owner_id))
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    db.delete(folder)
    db.commit()
