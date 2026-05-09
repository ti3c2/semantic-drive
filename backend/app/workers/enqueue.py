from __future__ import annotations

from uuid import UUID

from redis import Redis
from rq import Queue

from app.core.config import get_settings

settings = get_settings()


def enqueue_asset_ingestion(asset_id: UUID) -> None:
    if settings.auto_process_inline:
        from app.workers.tasks import process_asset

        process_asset(str(asset_id))
        return

    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue(settings.rq_queue_name, connection=redis_conn)
    queue.enqueue("app.workers.tasks.process_asset", str(asset_id), job_timeout="2h")
