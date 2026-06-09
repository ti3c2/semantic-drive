from __future__ import annotations

import os
from multiprocessing import Process

from redis import Redis
from rq import Queue, Worker

from app.core.config import get_settings
from app.db.session import create_db_schema
from app.services.qdrant_index import ensure_collection
from app.services.storage import ensure_bucket


def _run_worker(worker_index: int, *, with_scheduler: bool) -> None:
    settings = get_settings()
    redis_conn = Redis.from_url(settings.redis_url)
    queue = Queue(settings.rq_queue_name, connection=redis_conn)
    worker = Worker(
        [queue],
        connection=redis_conn,
        name=f"{settings.rq_queue_name}-{worker_index}-{os.getpid()}",
    )
    worker.work(with_scheduler=with_scheduler)


def main() -> None:
    settings = get_settings()
    create_db_schema()
    ensure_bucket()
    ensure_collection()
    if settings.worker_concurrency == 1:
        _run_worker(0, with_scheduler=True)
        return

    processes = [
        Process(target=_run_worker, args=(index,), kwargs={"with_scheduler": index == 0})
        for index in range(settings.worker_concurrency)
    ]
    try:
        for process in processes:
            process.start()
        for process in processes:
            process.join()
    finally:
        for process in processes:
            if process.is_alive():
                process.terminate()
        for process in processes:
            process.join()


if __name__ == "__main__":
    main()
