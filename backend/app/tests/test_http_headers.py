from __future__ import annotations

from urllib.parse import quote

from starlette.responses import StreamingResponse

from app.api.http_headers import content_disposition_header


def test_content_disposition_header_is_latin1_safe_for_unicode_filename() -> None:
    filename = "отчет🚀.pdf"

    header = content_disposition_header(filename, attachment=False)

    assert header.startswith('inline; filename="download.pdf"; filename*=UTF-8\'\'')
    assert quote(filename, safe="") in header
    header.encode("latin-1")
    response = StreamingResponse(
        iter([b"test"]),
        headers={"Content-Disposition": header},
    )
    assert response.headers["content-disposition"] == header


def test_content_disposition_header_sanitizes_ascii_fallback() -> None:
    filename = 'my "draft"; file.txt'

    header = content_disposition_header(filename, attachment=True)

    assert header.startswith('attachment; filename="my _draft_ file.txt";')
    assert quote(filename, safe="") in header
    header.encode("latin-1")


def test_content_disposition_header_uses_basename_only() -> None:
    filename = "../nested/資料.png"

    header = content_disposition_header(filename, attachment=True)

    assert 'filename="download.png"' in header
    assert quote("資料.png", safe="") in header
    assert "../nested" not in header


def test_asset_stream_response_accepts_unicode_filename(monkeypatch) -> None:
    from app.api.routes import assets

    monkeypatch.setattr(assets, "get_object_stream", lambda _object_name: FakeObjectResponse())

    response = assets._stream_object(
        "objects/original",
        content_type="image/jpeg",
        filename="шизальтуха.jpg",
        attachment=False,
    )

    assert response.headers["content-disposition"].startswith('inline; filename="download.jpg"')
    assert quote("шизальтуха.jpg", safe="") in response.headers["content-disposition"]


def test_share_stream_response_accepts_unicode_filename(monkeypatch) -> None:
    from app.api.routes import shares

    monkeypatch.setattr(shares, "get_object_stream", lambda _object_name: FakeObjectResponse())

    response = shares._stream_object(
        "objects/original",
        content_type="image/jpeg",
        filename="шизальтуха.jpg",
        attachment=True,
    )

    assert response.headers["content-disposition"].startswith(
        'attachment; filename="download.jpg"'
    )
    assert quote("шизальтуха.jpg", safe="") in response.headers["content-disposition"]


class FakeObjectResponse:
    def stream(self, _chunk_size: int):
        yield b"test"

    def close(self) -> None:
        pass

    def release_conn(self) -> None:
        pass
