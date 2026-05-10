from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.api.routes.assets import router as assets_router
from app.api.routes.folders import router as folders_router
from app.api.routes.search import router as search_router
from app.api.routes.shares import router as shares_router
from app.api.routes.tags import router as tags_router
from app.core.config import get_settings
from app.db.session import create_db_schema
from app.services.events import EVENT_CHANNEL, redis_client
from app.services.qdrant_index import ensure_collection
from app.services.storage import ensure_bucket

settings = get_settings()

app = FastAPI(title="Semantic Drive API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets_router)
app.include_router(search_router)
app.include_router(folders_router)
app.include_router(tags_router)
app.include_router(shares_router)


@app.on_event("startup")
def on_startup() -> None:
    create_db_schema()
    ensure_bucket()
    ensure_collection()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/events")
async def events() -> StreamingResponse:
    async def stream() -> AsyncIterator[str]:
        redis = redis_client()
        pubsub = redis.pubsub()
        pubsub.subscribe(EVENT_CHANNEL)
        try:
            while True:
                message = await asyncio.to_thread(
                    pubsub.get_message, ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message.get("data"):
                    yield f"data: {message['data']}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                await asyncio.sleep(0.25)
        finally:
            pubsub.close()
            redis.close()

    return StreamingResponse(stream(), media_type="text/event-stream")
