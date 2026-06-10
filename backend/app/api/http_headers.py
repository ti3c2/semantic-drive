from __future__ import annotations

import re
import unicodedata
from urllib.parse import quote

_INVALID_FALLBACK_CHARS = re.compile(r'[\x00-\x1f\x7f"\\;]+')
_WHITESPACE = re.compile(r"\s+")


def content_disposition_header(filename: str, *, attachment: bool) -> str:
    disposition_type = "attachment" if attachment else "inline"
    clean_filename = _clean_filename(filename)
    fallback = _ascii_filename_fallback(clean_filename)
    encoded_filename = quote(clean_filename, safe="")
    return f"{disposition_type}; filename=\"{fallback}\"; filename*=UTF-8''{encoded_filename}"


def _clean_filename(filename: str) -> str:
    cleaned = (filename or "download").replace("\\", "/").split("/")[-1].strip()
    if not cleaned:
        return "download"
    return "".join("_" if ord(char) < 32 or ord(char) == 127 else char for char in cleaned)


def _ascii_filename_fallback(filename: str) -> str:
    fallback = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode("ascii")
    fallback = _INVALID_FALLBACK_CHARS.sub("_", fallback)
    fallback = _WHITESPACE.sub(" ", fallback).strip()
    if fallback.startswith("."):
        return f"download{_ascii_extension(filename)}"

    fallback = fallback.strip(" .")
    if fallback:
        return fallback

    extension = _ascii_extension(filename)
    return f"download{extension}"


def _ascii_extension(filename: str) -> str:
    stem, dot, extension = filename.rpartition(".")
    if not stem or not dot or not extension:
        return ""

    ascii_extension = (
        unicodedata.normalize("NFKD", extension).encode("ascii", "ignore").decode("ascii")
    )
    ascii_extension = re.sub(r"[^A-Za-z0-9]+", "", ascii_extension)
    return f".{ascii_extension}" if ascii_extension else ""
