from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_db_schema() -> None:
    from app.db.models import Base

    Base.metadata.create_all(bind=engine)
    _ensure_schema_extensions()


def _ensure_schema_extensions() -> None:
    inspector = inspect(engine)
    if "assets" not in inspector.get_table_names():
        return
    asset_columns = {column["name"] for column in inspector.get_columns("assets")}
    if "trashed_at" in asset_columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE assets ADD COLUMN trashed_at TIMESTAMP WITH TIME ZONE")
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_assets_trashed_at ON assets (trashed_at)")
        )
