from __future__ import annotations

from redis import Redis
from rq import Queue, Worker

from app.core.config import get_settings
from app.db.session import create_db_schema
from app.services.qdrant_index import ensure_collection
from app.services.storage import ensure_bucket


def main() -> None:
    settings = get_settings()
    create_db_schema()
    ensure_bucket()
    ensure_collection()
    redis_conn = Redis.from_url(settings.redis_url)
    worker = Worker([Queue(settings.rq_queue_name, connection=redis_conn)], connection=redis_conn)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
