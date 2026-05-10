from __future__ import annotations

from app.core.config import Settings


def test_embedding_api_base_defaults_to_main_api_base() -> None:
    settings = Settings(openai_api_key="test-key", openai_api_base="https://api.mistral.ai/v1")

    assert settings.openai_emb_api_base is None
    assert settings.get_openai_emb_client().base_url == "https://api.mistral.ai/v1/"
