from __future__ import annotations

import json
import mimetypes
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".webm"}
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}


@dataclass(frozen=True)
class MediaInfo:
    media_type: str
    mime_type: str
    duration_ms: int | None = None
    width: int | None = None
    height: int | None = None


def guess_mime_type(filename: str, uploaded_content_type: str | None = None) -> str:
    if uploaded_content_type and uploaded_content_type != "application/octet-stream":
        return uploaded_content_type
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def detect_media_type(filename: str, mime_type: str) -> str:
    ext = Path(filename).suffix.lower()
    if mime_type.startswith("image/") or ext in IMAGE_EXTS:
        return "image"
    if mime_type.startswith("audio/") or ext in AUDIO_EXTS:
        return "audio"
    if mime_type.startswith("video/") or ext in VIDEO_EXTS:
        return "video"
    raise ValueError(f"Unsupported media type for {filename} ({mime_type})")


def probe_media(path: Path, media_type: str, mime_type: str) -> MediaInfo:
    if media_type == "image":
        with Image.open(path) as image:
            width, height = image.size
        return MediaInfo(media_type=media_type, mime_type=mime_type, width=width, height=height)

    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    completed = subprocess.run(cmd, check=True, capture_output=True, text=True)
    payload = json.loads(completed.stdout or "{}")

    duration_ms = _duration_ms_from_probe_payload(payload)

    width = None
    height = None
    if media_type == "video":
        video_stream = next(
            (s for s in payload.get("streams", []) if s.get("codec_type") == "video"), None
        )
        if video_stream:
            width = video_stream.get("width")
            height = video_stream.get("height")

    return MediaInfo(
        media_type=media_type,
        mime_type=mime_type,
        duration_ms=duration_ms,
        width=width,
        height=height,
    )


def _duration_ms_from_probe_payload(payload: dict) -> int | None:
    candidates = [payload.get("format", {}).get("duration")]
    candidates.extend(stream.get("duration") for stream in payload.get("streams", []))

    for duration in candidates:
        if duration in {None, "N/A"}:
            continue
        try:
            value = float(duration)
        except (TypeError, ValueError):
            continue
        if value > 0:
            return int(value * 1000)

    return None
