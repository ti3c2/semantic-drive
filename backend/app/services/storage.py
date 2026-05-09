from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from app.core.config import get_settings

settings = get_settings()


_client: Minio | None = None
_external_client: Minio | None = None


def get_minio_client(*, external: bool = False) -> Minio:
    global _client, _external_client
    if external:
        if _external_client is None:
            _external_client = Minio(
                settings.minio_external_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
            )
        return _external_client

    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _client


@retry(stop=stop_after_attempt(5), wait=wait_exponential_jitter(initial=0.5, max=8))
def ensure_bucket() -> None:
    client = get_minio_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=0.5, max=8))
def fput_file(object_name: str, path: Path, content_type: str | None = None) -> None:
    ensure_bucket()
    get_minio_client().fput_object(
        bucket_name=settings.minio_bucket,
        object_name=object_name,
        file_path=str(path),
        content_type=content_type or "application/octet-stream",
    )


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=0.5, max=8))
def put_file(object_name: str, data: BinaryIO, length: int, content_type: str | None = None) -> None:
    ensure_bucket()
    get_minio_client().put_object(
        bucket_name=settings.minio_bucket,
        object_name=object_name,
        data=data,
        length=length,
        content_type=content_type or "application/octet-stream",
    )


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=0.5, max=8))
def fget_file(object_name: str, path: Path) -> Path:
    ensure_bucket()
    path.parent.mkdir(parents=True, exist_ok=True)
    get_minio_client().fget_object(settings.minio_bucket, object_name, str(path))
    return path


def get_object_stream(object_name: str):
    ensure_bucket()
    return get_minio_client().get_object(settings.minio_bucket, object_name)


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=0.5, max=8))
def remove_object(object_name: str | None) -> None:
    if not object_name:
        return
    try:
        get_minio_client().remove_object(settings.minio_bucket, object_name)
    except S3Error as exc:
        if exc.code not in {"NoSuchKey", "NoSuchObject"}:
            raise


def presigned_get_url(object_name: str, expires_seconds: int = 3600) -> str:
    ensure_bucket()
    # Use the external endpoint so the URL works from the browser on localhost.
    return get_minio_client(external=True).presigned_get_object(
        settings.minio_bucket,
        object_name,
        expires=timedelta(seconds=expires_seconds),
    )
