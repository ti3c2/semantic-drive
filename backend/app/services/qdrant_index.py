from __future__ import annotations

from uuid import UUID

from qdrant_client import QdrantClient
from qdrant_client.http import models
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from app.core.config import get_settings

settings = get_settings()
_client: QdrantClient | None = None


def get_qdrant_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
    return _client


@retry(stop=stop_after_attempt(5), wait=wait_exponential_jitter(initial=0.5, max=8))
def ensure_collection() -> None:
    client = get_qdrant_client()
    try:
        client.get_collection(settings.qdrant_collection)
        return
    except Exception:
        pass

    client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=models.VectorParams(
            size=settings.openai_embedding_dimensions,
            distance=models.Distance.COSINE,
        ),
    )


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=0.5, max=8))
def upsert_points(points: list[models.PointStruct]) -> None:
    if not points:
        return
    ensure_collection()
    get_qdrant_client().upsert(collection_name=settings.qdrant_collection, points=points)


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=0.5, max=8))
def delete_asset_points(asset_id: UUID) -> None:
    ensure_collection()
    get_qdrant_client().delete(
        collection_name=settings.qdrant_collection,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="asset_id",
                        match=models.MatchValue(value=str(asset_id)),
                    )
                ]
            )
        ),
    )


def owner_filter(owner_id: UUID) -> models.Filter:
    return models.Filter(
        must=[
            models.FieldCondition(
                key="owner_id",
                match=models.MatchValue(value=str(owner_id)),
            )
        ]
    )


def build_search_filter(
    *,
    owner_id: UUID,
    media_types: list[str] | None = None,
    tags: list[str] | None = None,
    folder_ids: list[UUID] | None = None,
) -> models.Filter:
    must: list[models.Condition] = [
        models.FieldCondition(key="owner_id", match=models.MatchValue(value=str(owner_id)))
    ]
    if media_types:
        must.append(models.FieldCondition(key="media_type", match=models.MatchAny(any=media_types)))
    if tags:
        must.append(models.FieldCondition(key="tags", match=models.MatchAny(any=tags)))
    if folder_ids:
        must.append(models.FieldCondition(key="folder_ids", match=models.MatchAny(any=[str(v) for v in folder_ids])))
    return models.Filter(must=must)


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=0.5, max=8))
def query_points(vector: list[float], query_filter: models.Filter, limit: int):
    ensure_collection()
    client = get_qdrant_client()
    if hasattr(client, "query_points"):
        result = client.query_points(
            collection_name=settings.qdrant_collection,
            query=vector,
            query_filter=query_filter,
            limit=limit,
            with_payload=True,
            with_vectors=False,
        )
        return getattr(result, "points", result)

    return client.search(
        collection_name=settings.qdrant_collection,
        query_vector=vector,
        query_filter=query_filter,
        limit=limit,
        with_payload=True,
        with_vectors=False,
    )


def point_struct(*, point_id: UUID, vector: list[float], payload: dict) -> models.PointStruct:
    return models.PointStruct(id=str(point_id), vector=vector, payload=payload)
