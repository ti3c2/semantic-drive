from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from app.workers import enqueue, worker


def test_enqueue_asset_ingestion_uses_bounded_retry_policy(monkeypatch) -> None:
    enqueued = []
    fake_connection = object()

    class FakeRetry:
        def __init__(self, max: int, interval: list[int]) -> None:
            self.max = max
            self.interval = interval

    class FakeQueue:
        def __init__(self, name: str, connection) -> None:
            self.name = name
            self.connection = connection

        def enqueue(self, *args, **kwargs) -> None:
            enqueued.append((self.name, self.connection, args, kwargs))

    monkeypatch.setattr(
        enqueue,
        "settings",
        SimpleNamespace(
            auto_process_inline=False,
            redis_url="redis://queue",
            rq_queue_name="semantic-drive",
            ingestion_job_retries=2,
            ingestion_retry_delay_seconds=30,
        ),
    )
    monkeypatch.setattr(enqueue.Redis, "from_url", lambda url: fake_connection)
    monkeypatch.setattr(enqueue, "Queue", FakeQueue)
    monkeypatch.setattr(enqueue, "Retry", FakeRetry)

    asset_id = uuid4()
    enqueue.enqueue_asset_ingestion(asset_id)

    assert len(enqueued) == 1
    queue_name, connection, args, kwargs = enqueued[0]
    assert queue_name == "semantic-drive"
    assert connection is fake_connection
    assert args == ("app.workers.tasks.process_asset", str(asset_id))
    assert kwargs["job_timeout"] == "2h"
    assert kwargs["retry"].max == 2
    assert kwargs["retry"].interval == [30, 60]


def test_worker_main_starts_configured_worker_processes(monkeypatch) -> None:
    setup_calls = []
    processes = []

    class FakeProcess:
        def __init__(self, target, args, kwargs) -> None:
            self.target = target
            self.args = args
            self.kwargs = kwargs
            self.started = False
            self.terminated = False
            processes.append(self)

        def start(self) -> None:
            self.started = True

        def join(self) -> None:
            pass

        def is_alive(self) -> bool:
            return False

        def terminate(self) -> None:
            self.terminated = True

    monkeypatch.setattr(worker, "get_settings", lambda: SimpleNamespace(worker_concurrency=5))
    monkeypatch.setattr(worker, "create_db_schema", lambda: setup_calls.append("db"))
    monkeypatch.setattr(worker, "ensure_bucket", lambda: setup_calls.append("bucket"))
    monkeypatch.setattr(worker, "ensure_collection", lambda: setup_calls.append("collection"))
    monkeypatch.setattr(worker, "Process", FakeProcess)

    worker.main()

    assert setup_calls == ["db", "bucket", "collection"]
    assert len(processes) == 5
    assert all(process.started for process in processes)
    assert [process.args for process in processes] == [(0,), (1,), (2,), (3,), (4,)]
    assert [process.kwargs["with_scheduler"] for process in processes] == [
        True,
        False,
        False,
        False,
        False,
    ]
    assert not any(process.terminated for process in processes)


def test_worker_main_runs_directly_when_concurrency_is_one(monkeypatch) -> None:
    setup_calls = []
    run_calls = []

    monkeypatch.setattr(worker, "get_settings", lambda: SimpleNamespace(worker_concurrency=1))
    monkeypatch.setattr(worker, "create_db_schema", lambda: setup_calls.append("db"))
    monkeypatch.setattr(worker, "ensure_bucket", lambda: setup_calls.append("bucket"))
    monkeypatch.setattr(worker, "ensure_collection", lambda: setup_calls.append("collection"))
    monkeypatch.setattr(
        worker, "_run_worker", lambda *args, **kwargs: run_calls.append((args, kwargs))
    )

    worker.main()

    assert setup_calls == ["db", "bucket", "collection"]
    assert run_calls == [((0,), {"with_scheduler": True})]
