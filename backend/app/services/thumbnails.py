from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw


THUMB_SIZE = (640, 640)


def generate_thumbnail(input_path: Path, media_type: str, output_path: Path, label: str | None = None) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if media_type == "image":
        return _image_thumbnail(input_path, output_path)
    if media_type == "video":
        return _video_thumbnail(input_path, output_path)
    return _placeholder_thumbnail(output_path, label or "Audio")


def _image_thumbnail(input_path: Path, output_path: Path) -> Path:
    with Image.open(input_path) as image:
        image = image.convert("RGB")
        image.thumbnail(THUMB_SIZE)
        canvas = Image.new("RGB", THUMB_SIZE, (245, 245, 245))
        x = (THUMB_SIZE[0] - image.width) // 2
        y = (THUMB_SIZE[1] - image.height) // 2
        canvas.paste(image, (x, y))
        canvas.save(output_path, format="JPEG", quality=85)
    return output_path


def _video_thumbnail(input_path: Path, output_path: Path) -> Path:
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                "1",
                "-i",
                str(input_path),
                "-frames:v",
                "1",
                "-vf",
                "scale=640:-1",
                str(output_path),
            ],
            check=True,
            capture_output=True,
        )
        if output_path.exists() and output_path.stat().st_size > 0:
            return output_path
    except subprocess.CalledProcessError:
        pass
    return _placeholder_thumbnail(output_path, "Video")


def _placeholder_thumbnail(output_path: Path, label: str) -> Path:
    image = Image.new("RGB", THUMB_SIZE, (245, 245, 245))
    draw = ImageDraw.Draw(image)
    text = label[:80]
    draw.rounded_rectangle((80, 180, 560, 460), radius=28, outline=(180, 180, 180), width=3)
    draw.text((120, 300), text, fill=(60, 60, 60))
    image.save(output_path, format="JPEG", quality=85)
    return output_path
