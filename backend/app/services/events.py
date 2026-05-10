from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID

from redis import Redis

from app.core.config import get_settings

settings = get_settings()
EVENT_CHANNEL = "semantic-drive-events"


def redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def publish_asset_event(
    asset_id: UUID, status: str, step: str | None = None, progress: int | None = None
) -> None:
    payload = {
        "type": "asset_processing_update",
        "asset_id": str(asset_id),
        "status": status,
        "step": step,
        "progress": progress,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    try:
        redis_client().publish(EVENT_CHANNEL, json.dumps(payload))
    except Exception:
        # Events are nice-to-have. Indexing should not die because a live UI update coughed.
        return
