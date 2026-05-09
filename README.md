# Semantic Drive

A fast, minimal local-first scaffold for searchable media storage.

Drop in images, audio, or video. The backend stores the raw file in MinIO, extracts searchable text with OpenAI where configured, embeds chunks, indexes them in Qdrant, and serves a simple Astro/React UI for upload, search, preview, download, and sharing.

This repository is intentionally built as an MVP foundation, not a bloated enterprise content platform wearing a startup hoodie.

## Stack

- Backend: FastAPI, SQLAlchemy, Postgres, Redis/RQ, Qdrant, MinIO
- Package management: `uv`
- Settings: `pydantic-settings`
- Retries: `tenacity`
- Media processing: FFmpeg, Pillow
- AI APIs: OpenAI for OCR/caption/transcription/embeddings, Cohere for optional reranking
- Frontend: Astro + React island

## Local development

### 1. Copy env file

```bash
cp .env.example .env
```

Add API keys when you want real AI processing:

```dotenv
OPENAI_API_KEY=sk-...
COHERE_API_KEY=...
```

Without `OPENAI_API_KEY`, the app still runs and uses deterministic local mock embeddings so you can test upload/search plumbing without sacrificing your wallet to the API gods.

### 2. Start services

```bash
docker compose up --build
```

Open:

- Frontend: http://localhost:4321
- Backend API: http://localhost:8000/docs
- MinIO Console: http://localhost:9001
- Qdrant: http://localhost:6333/dashboard

MinIO credentials from `.env.example`:

- user: `semantic`
- password: `semantic-secret`

### 3. Run only backend locally with uv

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Run worker:

```bash
cd backend
uv run python -m app.workers.worker
```

### 4. Run frontend locally

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

## API overview

- `POST /api/assets` upload media
- `GET /api/assets` list assets
- `GET /api/assets/{id}` asset detail
- `PATCH /api/assets/{id}` update metadata
- `DELETE /api/assets/{id}` delete asset
- `POST /api/search` semantic search
- `POST /api/assets/{id}/shares` create share link
- `GET /s/{token}` share preview page
- `GET /s/{token}/raw` inline raw media
- `GET /s/{token}/download` force download
- `GET /api/events` server-sent events for processing status

## Notes

- Auth is deliberately stubbed via `DEMO_OWNER_ID`; plug in real auth before shipping to the world, because the world contains humans.
- MinIO is used locally, but the storage service is isolated so managed S3/R2 can replace it later.
- Qdrant stores searchable chunks, not the original files.
- Postgres stores metadata and ownership.
- The worker does extraction and indexing. Keep it separate from request handling.

## Production TODOs

- Add real auth and per-user/team access control.
- Replace inline `Base.metadata.create_all` with Alembic migrations.
- Use managed Postgres, Qdrant Cloud, managed Redis, managed S3/R2.
- Add virus scanning and stricter file validation.
- Add rate limits.
- Add audit logs.
- Add signed URL offload for large file serving.
- Add full visual video-frame indexing.
