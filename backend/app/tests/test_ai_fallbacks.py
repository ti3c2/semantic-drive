from __future__ import annotations

from app.services import embeddings, openai_extract


def test_extract_image_text_falls_back_when_vision_calls_fail(monkeypatch, tmp_path) -> None:
    image_path = tmp_path / "image.jpg"
    image_path.write_bytes(b"fake image bytes")

    monkeypatch.setattr(openai_extract.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(
        openai_extract,
        "_vision_via_responses",
        lambda _path, _mime_type: (_ for _ in ()).throw(RuntimeError("responses unavailable")),
    )
    monkeypatch.setattr(
        openai_extract,
        "_vision_via_chat",
        lambda _path, _mime_type: (_ for _ in ()).throw(RuntimeError("chat unavailable")),
    )

    result = openai_extract.extract_image_text(image_path, "image/jpeg", "receipt.jpg")

    assert result["ocr_text"] == ""
    assert "receipt.jpg" in result["visual_summary"]
    assert "RuntimeError" in result["visual_summary"]
    assert result["search_keywords"] == ["receipt"]


def test_transcribe_audio_file_falls_back_when_transcription_fails(monkeypatch, tmp_path) -> None:
    audio_path = tmp_path / "audio.mp3"
    audio_path.write_bytes(b"fake audio bytes")

    monkeypatch.setattr(openai_extract.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(
        openai_extract,
        "_transcribe_audio_file_via_openai",
        lambda _path: (_ for _ in ()).throw(RuntimeError("transcription unavailable")),
    )

    text = openai_extract.transcribe_audio_file(audio_path)

    assert text == "AI transcription was skipped after retries: RuntimeError."


def test_embed_texts_falls_back_to_deterministic_embeddings(monkeypatch) -> None:
    monkeypatch.setattr(embeddings.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(
        embeddings,
        "_embed_with_openai",
        lambda _texts: (_ for _ in ()).throw(RuntimeError("embedding unavailable")),
    )

    vectors = embeddings.embed_texts(["hello", "world"])

    assert len(vectors) == 2
    assert len(vectors[0]) == embeddings.settings.openai_embedding_dimensions
    assert vectors == embeddings.embed_texts(["hello", "world"])
