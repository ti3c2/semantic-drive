from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal
from uuid import UUID

import httpx
from openai import OpenAI
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["local", "test", "staging", "production"] = "local"
    api_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:4321"
    demo_owner_id: UUID = UUID("00000000-0000-0000-0000-000000000001")
    auto_process_inline: bool = False

    openai_api_key: str | None = None
    cohere_api_key: str | None = None

    openai_api_base: str = "https://api.openai.com/v1"
    openai_vision_model: str = "gpt-4o-mini"
    openai_transcription_model: str = "gpt-4o-mini-transcribe"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_emb_api_base: str | None = None
    openai_embedding_dimensions: int = 1536
    openai_use_proxy: bool = False
    proxy_url: str | None = None
    cohere_rerank_model: str = "rerank-v3.5"

    database_url: str = "postgresql+psycopg://semantic:semantic@localhost:5432/semantic_drive"
    redis_url: str = "redis://localhost:6379/0"
    rq_queue_name: str = "semantic-drive"
    worker_concurrency: int = Field(default=5, ge=1, le=32)
    ingestion_job_retries: int = Field(default=2, ge=0, le=10)
    ingestion_retry_delay_seconds: int = Field(default=30, ge=0)
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "semantic_drive_chunks"

    minio_endpoint: str = "localhost:9000"
    minio_external_endpoint: str = "localhost:9000"
    minio_access_key: str = "semantic"
    minio_secret_key: str = "semantic-secret"
    minio_bucket: str = "semantic-drive"
    minio_secure: bool = False

    max_upload_mb: int = Field(default=512, ge=1)
    tmp_dir: Path = Path("/tmp/semantic-drive")
    allowed_origins: list[str] = ["http://localhost:4321", "http://127.0.0.1:4321"]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_cohere(self) -> bool:
        return bool(self.cohere_api_key)

    def _get_openai_client(self, api_base: str) -> OpenAI:
        return OpenAI(
            api_key=self.openai_api_key,
            base_url=api_base,
            http_client=(httpx.Client(proxy=self.proxy_url) if self.openai_use_proxy else None),
        )

    def get_openai_client(self) -> OpenAI:
        return self._get_openai_client(self.openai_api_base)

    def get_openai_emb_client(self) -> OpenAI:
        return self._get_openai_client(self.openai_emb_api_base or self.openai_api_base)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    return settings
