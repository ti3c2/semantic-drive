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

Infrastructure lives under `infra/`. Caddy is the browser-facing edge proxy: it terminates local HTTPS, sends `/api/*`, `/s/*`, `/embed/*`, `/docs`, `/redoc`, `/openapi.json`, and `/health` to FastAPI, and sends everything else to Astro.

The app containers are only exposed on the Docker network. Data services still publish local ports for development tools.

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
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

Open:

- App: https://semanticdrive.localhost
- Backend API docs: https://semanticdrive.localhost/docs
- MinIO Console: http://localhost:9011
- Qdrant: http://localhost:6330/dashboard

MinIO credentials from `.env.example`:

- user: `semantic`
- password: `semantic-secret`

Caddy uses an internal local CA for `https://semanticdrive.localhost`. The first browser visit may require accepting the local certificate unless you import the generated Caddy root certificate from the `caddy` container.

To export that root certificate:

```bash
docker compose --env-file .env -f infra/docker-compose.yml cp caddy:/data/caddy/pki/authorities/local/root.crt infra/caddy/local-root.crt
```

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
PUBLIC_API_BASE_URL=http://localhost:8000 npm run dev -- --host 0.0.0.0
```

### 5. Formatting and pre-commit

Install frontend tooling:

```bash
(cd frontend && npm install)
```

Format the backend with Ruff and the frontend with Prettier:

```bash
./scripts/format.sh
```

Install the pre-commit hook:

```bash
./scripts/install-pre-commit.sh
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
