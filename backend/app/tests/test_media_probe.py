from __future__ import annotations

from app.services.media_probe import _duration_ms_from_probe_payload


def test_duration_ms_from_probe_payload_uses_format_duration() -> None:
    assert (
        _duration_ms_from_probe_payload({"format": {"duration": "12.345"}, "streams": []}) == 12345
    )


def test_duration_ms_from_probe_payload_falls_back_to_stream_duration() -> None:
    assert (
        _duration_ms_from_probe_payload(
            {
                "format": {},
                "streams": [
                    {"codec_type": "audio", "duration": "8.25"},
                    {"codec_type": "video", "duration": "9.5"},
                ],
            }
        )
        == 8250
    )


def test_duration_ms_from_probe_payload_ignores_invalid_duration() -> None:
    assert (
        _duration_ms_from_probe_payload(
            {"format": {"duration": "N/A"}, "streams": [{"duration": "-1"}]}
        )
        is None
    )
