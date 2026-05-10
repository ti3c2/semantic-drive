from __future__ import annotations

import base64
import json
import mimetypes
import subprocess
from pathlib import Path
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from app.core.config import get_settings

settings = get_settings()

IMAGE_INDEXING_PROMPT = """
You are indexing a user-uploaded media asset for semantic search.
Return strict JSON with exactly these keys:
{
  "ocr_text": "all readable text, preserving line breaks when useful",
  "visual_summary": "short searchable description of the image",
  "search_keywords": ["keyword1", "keyword2"],
  "detected_document_type": "screenshot|photo|poster|invoice|receipt|slide|diagram|unknown",
  "confidence_notes": "brief note if text is blurry, rotated, hidden, or uncertain"
}
Do not invent text. If no text is visible, set ocr_text to an empty string.
""".strip()


def _clean_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def _data_url(path: Path, mime_type: str | None = None) -> str:
    mime_type = mime_type or mimetypes.guess_type(path.name)[0] or "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{data}"


def _fallback_image_extraction(filename: str, reason: str) -> dict[str, Any]:
    return {
        "ocr_text": "",
        "visual_summary": f"Image asset named {filename}. AI vision indexing was skipped: {reason}.",
        "search_keywords": [Path(filename).stem],
        "detected_document_type": "unknown",
        "confidence_notes": "Fallback extraction. Description, tags, filename, and available metadata remain searchable.",
    }


@retry(stop=stop_after_attempt(3), wait=wait_exponential_jitter(initial=1, max=10))
def _vision_via_responses(path: Path, mime_type: str) -> str:
    client = settings.get_openai_client()
    response = client.responses.create(
        model=settings.openai_vision_model,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": IMAGE_INDEXING_PROMPT},
                    {"type": "input_image", "image_url": _data_url(path, mime_type)},
                ],
            }
        ],
    )
    return getattr(response, "output_text", None) or str(response)


@retry(stop=stop_after_attempt(3), wait=wait_exponential_jitter(initial=1, max=10))
def _vision_via_chat(path: Path, mime_type: str) -> str:
    client = settings.get_openai_client()
    response = client.chat.completions.create(
        model=settings.openai_vision_model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": IMAGE_INDEXING_PROMPT},
                    {"type": "image_url", "image_url": {"url": _data_url(path, mime_type)}},
                ],
            }
        ],
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or "{}"


def extract_image_text(path: Path, mime_type: str, filename: str) -> dict[str, Any]:
    if not settings.has_openai:
        return _fallback_image_extraction(filename, "OpenAI API key is not configured")

    try:
        raw = _vision_via_responses(path, mime_type)
        return _clean_json(raw)
    except Exception as responses_exc:
        try:
            raw = _vision_via_chat(path, mime_type)
            return _clean_json(raw)
        except Exception as chat_exc:
            reason = f"{type(responses_exc).__name__}, then {type(chat_exc).__name__}"
            return _fallback_image_extraction(filename, reason)


@retry(stop=stop_after_attempt(3), wait=wait_exponential_jitter(initial=1, max=10))
def _transcribe_audio_file_via_openai(path: Path) -> str:
    client = settings.get_openai_client()
    with path.open("rb") as handle:
        response = client.audio.transcriptions.create(
            model=settings.openai_transcription_model,
            file=handle,
        )
    return getattr(response, "text", None) or str(response)


def transcribe_audio_file(path: Path) -> str:
    if not settings.has_openai:
        return "OpenAI API key is not configured, so transcription was skipped."

    try:
        return _transcribe_audio_file_via_openai(path)
    except Exception as exc:
        return f"AI transcription was skipped after retries: {type(exc).__name__}."


def extract_audio_from_video(video_path: Path, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "libmp3lame",
            "-ar",
            "16000",
            "-ac",
            "1",
            str(output_path),
        ],
        check=True,
        capture_output=True,
    )
    return output_path


def split_audio_if_needed(audio_path: Path, output_dir: Path, max_mb: int = 20) -> list[Path]:
    # OpenAI transcription uploads have size limits. Keep chunks safely below the limit.
    if audio_path.stat().st_size <= max_mb * 1024 * 1024:
        return [audio_path]

    output_dir.mkdir(parents=True, exist_ok=True)
    pattern = output_dir / "chunk_%03d.mp3"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(audio_path),
            "-f",
            "segment",
            "-segment_time",
            "600",
            "-c",
            "copy",
            str(pattern),
        ],
        check=True,
        capture_output=True,
    )
    chunks = sorted(output_dir.glob("chunk_*.mp3"))
    return chunks or [audio_path]
