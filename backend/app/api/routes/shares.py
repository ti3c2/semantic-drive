from __future__ import annotations

from datetime import datetime, timezone
from html import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.http_headers import content_disposition_header
from app.core.config import get_settings
from app.core.security import hash_share_token
from app.db.models import Share
from app.db.session import get_db
from app.services.storage import get_object_stream

settings = get_settings()
router = APIRouter(tags=["shares"])


def _valid_share(token: str, db: Session) -> Share:
    share = db.scalar(select(Share).where(Share.token_hash == hash_share_token(token)))
    now = datetime.now(timezone.utc)
    if not share or share.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.expires_at and share.expires_at < now:
        raise HTTPException(status_code=404, detail="Share expired")
    return share


def _stream_object(object_name: str, *, content_type: str, filename: str, attachment: bool) -> StreamingResponse:
    response = get_object_stream(object_name)

    def iterator():
        try:
            for chunk in response.stream(32 * 1024):
                yield chunk
        finally:
            response.close()
            response.release_conn()

    return StreamingResponse(
        iterator(),
        media_type=content_type,
        headers={"Content-Disposition": content_disposition_header(filename, attachment=attachment)},
    )


def _preview_html(token: str, share: Share, *, embed: bool = False) -> str:
    asset = share.asset
    title = escape(asset.display_title or asset.original_filename)
    thumb = f"{settings.api_base_url}/s/{token}/thumbnail" if asset.thumbnail_key else f"{settings.api_base_url}/s/{token}/raw"
    raw = f"{settings.api_base_url}/s/{token}/raw"
    download = f"{settings.api_base_url}/s/{token}/download"

    if asset.media_type == "image":
        media = f'<img src="{raw}" alt="{title}" />'
    elif asset.media_type == "video":
        media = f'<video controls src="{raw}" poster="{thumb}"></video>'
    elif asset.media_type == "audio":
        media = f'<audio controls src="{raw}"></audio>'
    else:
        media = f'<a href="{download}">Download {title}</a>'

    download_link = "" if embed or not share.allow_download else f'<a class="button" href="{download}">Download</a>'
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <meta property="og:title" content="{title}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="{thumb}" />
  <meta property="og:url" content="{settings.api_base_url}/s/{token}" />
  <meta property="og:description" content="Shared via Semantic Drive" />
  <style>
    body {{ margin: 0; font-family: Inter, system-ui, sans-serif; background: #f7f7f5; color: #171717; }}
    main {{ min-height: 100vh; display: grid; place-items: center; padding: 32px; box-sizing: border-box; }}
    .card {{ width: min(960px, 100%); background: white; border: 1px solid #e5e5e5; border-radius: 24px; padding: 24px; box-shadow: 0 16px 60px rgba(0,0,0,.08); }}
    img, video {{ max-width: 100%; max-height: 72vh; display: block; margin: 0 auto; border-radius: 16px; }}
    audio {{ width: 100%; }}
    h1 {{ font-size: 20px; margin: 0 0 16px; }}
    .button {{ display: inline-block; margin-top: 16px; padding: 10px 14px; border-radius: 12px; color: white; background: #171717; text-decoration: none; }}
  </style>
</head>
<body><main><section class="card"><h1>{title}</h1>{media}{download_link}</section></main></body>
</html>"""


@router.get("/s/{token}", response_class=HTMLResponse)
def share_page(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    share = _valid_share(token, db)
    return HTMLResponse(_preview_html(token, share))


@router.get("/embed/{token}", response_class=HTMLResponse)
def embed_page(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    share = _valid_share(token, db)
    return HTMLResponse(_preview_html(token, share, embed=True))


@router.get("/s/{token}/thumbnail")
def share_thumbnail(token: str, db: Session = Depends(get_db)) -> StreamingResponse:
    share = _valid_share(token, db)
    asset = share.asset
    if not asset.thumbnail_key:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return _stream_object(asset.thumbnail_key, content_type="image/jpeg", filename="thumbnail.jpg", attachment=False)


@router.get("/s/{token}/raw")
def share_raw(token: str, db: Session = Depends(get_db)) -> StreamingResponse:
    share = _valid_share(token, db)
    asset = share.asset
    return _stream_object(asset.storage_key, content_type=asset.mime_type, filename=asset.original_filename, attachment=False)


@router.get("/s/{token}/download")
def share_download(token: str, db: Session = Depends(get_db)) -> StreamingResponse:
    share = _valid_share(token, db)
    if not share.allow_download:
        raise HTTPException(status_code=403, detail="Download is disabled for this share")
    asset = share.asset
    return _stream_object(asset.storage_key, content_type=asset.mime_type, filename=asset.original_filename, attachment=True)
