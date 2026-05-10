from __future__ import annotations

import hashlib
import math
from typing import Iterable

from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from app.core.config import get_settings

settings = get_settings()


def deterministic_embedding(text: str, dimensions: int) -> list[float]:
    """Cheap local fallback for development without API keys."""
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    values: list[float] = []
    counter = 0
    while len(values) < dimensions:
        block = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
        for idx in range(0, len(block), 2):
            number = int.from_bytes(block[idx : idx + 2], "big")
            values.append((number / 32767.5) - 1.0)
            if len(values) == dimensions:
                break
        counter += 1
    norm = math.sqrt(sum(v * v for v in values)) or 1.0
    return [v / norm for v in values]


@retry(stop=stop_after_attempt(4), wait=wait_exponential_jitter(initial=1, max=12))
def _embed_with_openai(texts: list[str]) -> list[list[float]]:
    client = settings.get_openai_emb_client()
    try:
        response = client.embeddings.create(
            model=settings.openai_embedding_model,
            input=texts,
            dimensions=settings.openai_embedding_dimensions,
        )
    except Exception as exc:
        if "dimensions" not in str(exc).lower():
            raise
        response = client.embeddings.create(
            model=settings.openai_embedding_model,
            input=texts,
        )
    return [item.embedding for item in response.data]


def embed_texts(texts: Iterable[str]) -> list[list[float]]:
    clean_texts = [text.strip() for text in texts if text and text.strip()]
    if not clean_texts:
        return []
    if not settings.has_openai:
        return [
            deterministic_embedding(text, settings.openai_embedding_dimensions)
            for text in clean_texts
        ]
    try:
        return _embed_with_openai(clean_texts)
    except Exception:
        return [
            deterministic_embedding(text, settings.openai_embedding_dimensions)
            for text in clean_texts
        ]
