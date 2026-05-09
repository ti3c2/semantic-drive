from __future__ import annotations

from dataclasses import dataclass

from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from app.core.config import get_settings

settings = get_settings()


@dataclass(frozen=True)
class RerankHit:
    index: int
    score: float


@retry(stop=stop_after_attempt(3), wait=wait_exponential_jitter(initial=1, max=8))
def rerank(query: str, documents: list[str], top_n: int | None = None) -> list[RerankHit]:
    if not settings.has_cohere or not documents:
        return []

    import cohere

    top_n = top_n or len(documents)
    if hasattr(cohere, "ClientV2"):
        client = cohere.ClientV2(api_key=settings.cohere_api_key)
        response = client.rerank(
            model=settings.cohere_rerank_model,
            query=query,
            documents=documents,
            top_n=top_n,
        )
    else:
        client = cohere.Client(settings.cohere_api_key)
        response = client.rerank(
            model=settings.cohere_rerank_model,
            query=query,
            documents=documents,
            top_n=top_n,
        )

    hits = []
    for item in getattr(response, "results", []):
        index = getattr(item, "index", None)
        score = getattr(item, "relevance_score", None)
        if index is None and isinstance(item, dict):
            index = item.get("index")
            score = item.get("relevance_score")
        if index is not None and score is not None:
            hits.append(RerankHit(index=int(index), score=float(score)))
    return hits
