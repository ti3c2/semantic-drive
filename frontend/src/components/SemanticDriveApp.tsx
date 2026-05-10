import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './SemanticDriveApp.css';

const API_BASE = (import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

type Asset = {
  id: string;
  original_filename: string;
  display_title?: string | null;
  description?: string | null;
  media_type: 'image' | 'audio' | 'video' | string;
  mime_type: string;
  file_size_bytes: number;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  processing_status: string;
  visibility: string;
  thumbnail_url?: string | null;
  raw_url: string;
  download_url: string;
  tags: { id: string; name: string }[];
  created_at: string;
};

type AssetDetail = Asset & {
  ocr_text?: string | null;
  visual_summary?: string | null;
  transcript?: string | null;
  extractions: { id: string; type: string; text: string; extra: Record<string, unknown> }[];
};

type SearchResult = {
  asset_id: string;
  title: string;
  original_filename: string;
  media_type: string;
  mime_type: string;
  thumbnail_url?: string | null;
  raw_url: string;
  download_url: string;
  score: number;
  vector_score?: number | null;
  rerank_score?: number | null;
  match_reason: { type: string; text: string; start_ms?: number | null; end_ms?: number | null };
  tags: string[];
  created_at: string;
};

type DisplayItem = {
  id: string;
  title: string;
  original_filename: string;
  media_type: string;
  mime_type: string;
  thumbnail_url?: string | null;
  raw_url: string;
  download_url: string;
  status?: string;
  score?: number;
  match?: SearchResult['match_reason'];
  tags: string[];
  created_at: string;
};

function api(path: string) {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function assetToDisplay(asset: Asset): DisplayItem {
  return {
    id: asset.id,
    title: asset.display_title || asset.original_filename,
    original_filename: asset.original_filename,
    media_type: asset.media_type,
    mime_type: asset.mime_type,
    thumbnail_url: asset.thumbnail_url,
    raw_url: asset.raw_url,
    download_url: asset.download_url,
    status: asset.processing_status,
    tags: asset.tags.map((tag) => tag.name),
    created_at: asset.created_at
  };
}

function resultToDisplay(result: SearchResult): DisplayItem {
  return {
    id: result.asset_id,
    title: result.title,
    original_filename: result.original_filename,
    media_type: result.media_type,
    mime_type: result.mime_type,
    thumbnail_url: result.thumbnail_url,
    raw_url: result.raw_url,
    download_url: result.download_url,
    score: result.score,
    match: result.match_reason,
    tags: result.tags,
    created_at: result.created_at
  };
}

export default function SemanticDriveApp() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [sharePayload, setSharePayload] = useState<Record<string, string> | null>(null);
  const [activeType, setActiveType] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = useCallback(async () => {
    const response = await fetch(api('/api/assets'));
    if (!response.ok) throw new Error('Failed to load assets');
    setAssets(await response.json());
  }, []);

  useEffect(() => {
    loadAssets().catch((err) => setError(err.message));
  }, [loadAssets]);

  useEffect(() => {
    const source = new EventSource(api('/api/events'));
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type !== 'asset_processing_update') return;
      setAssets((current) =>
        current.map((asset) =>
          asset.id === payload.asset_id ? { ...asset, processing_status: payload.status } : asset
        )
      );
      if (payload.status === 'ready' || payload.status === 'failed') {
        loadAssets().catch(() => undefined);
      }
    };
    return () => source.close();
  }, [loadAssets]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length) void uploadFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(api(`/api/assets/${selectedId}`))
      .then((response) => {
        if (!response.ok) throw new Error('Could not load asset detail');
        return response.json();
      })
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [selectedId]);

  const displayed = useMemo(() => {
    const source: DisplayItem[] = query.trim() ? results.map(resultToDisplay) : assets.map(assetToDisplay);
    if (activeType === 'all') return source;
    return source.filter((item) => item.media_type === activeType);
  }, [assets, results, query, activeType]);

  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('title', file.name);
        const response = await fetch(api('/api/assets'), { method: 'POST', body: form });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || `Upload failed for ${file.name}`);
        }
        const asset = (await response.json()) as Asset;
        setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      await loadAssets();
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(api('/api/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          filters: { media_types: activeType === 'all' ? [] : [activeType] },
          limit: 50,
          rerank: true
        })
      });
      if (!response.ok) throw new Error('Search failed');
      const payload = await response.json();
      setResults(payload.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function createShare(assetId: string) {
    setSharePayload(null);
    const response = await fetch(api(`/api/assets/${assetId}/shares`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow_download: true })
    });
    if (!response.ok) throw new Error('Could not create share link');
    const payload = await response.json();
    setSharePayload(payload);
    await navigator.clipboard.writeText(payload.share_url);
  }

  async function copyRawUrl(path: string) {
    await navigator.clipboard.writeText(api(path));
  }

  async function copyImageToClipboard(item: DisplayItem) {
    if (!item.mime_type.startsWith('image/')) {
      await copyRawUrl(item.raw_url);
      return;
    }
    try {
      const blob = await fetch(api(item.raw_url)).then((response) => response.blob());
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch {
      await copyRawUrl(item.raw_url);
    }
  }

  return (
    <main className="sd-app">
      <aside className="sd-sidebar">
        <div className="sd-logo">Semantic Drive</div>
        <button className={activeType === 'all' ? 'active' : ''} onClick={() => setActiveType('all')}>All</button>
        <button className={activeType === 'image' ? 'active' : ''} onClick={() => setActiveType('image')}>Images</button>
        <button className={activeType === 'video' ? 'active' : ''} onClick={() => setActiveType('video')}>Videos</button>
        <button className={activeType === 'audio' ? 'active' : ''} onClick={() => setActiveType('audio')}>Audio</button>
        <div className="sd-sidebar-note">Paste, drop, search. No ceremonial onboarding parade.</div>
      </aside>

      <section className="sd-main">
        <header className="sd-header">
          <form onSubmit={runSearch} className="sd-search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search text, speech, screenshots, tags..."
              autoFocus
            />
            <button disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
          </form>
          <button className="sd-upload-button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="image/*,audio/*,video/*"
            onChange={(event) => uploadFiles(Array.from(event.target.files || []))}
          />
        </header>

        <div
          className="sd-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void uploadFiles(Array.from(event.dataTransfer.files || []));
          }}
        >
          <strong>Drop files here</strong>
          <span>Images get OCR/captions, audio gets transcript, videos get audio transcription.</span>
        </div>

        {error && <div className="sd-error">{error}</div>}

        <div className="sd-result-count">
          {query.trim() ? `${displayed.length} semantic result${displayed.length === 1 ? '' : 's'}` : `${displayed.length} file${displayed.length === 1 ? '' : 's'}`}
        </div>

        <section className="sd-grid">
          {displayed.map((item) => (
            <article key={item.id} className="sd-card" onClick={() => setSelectedId(item.id)}>
              <div className="sd-thumb">
                {item.thumbnail_url ? (
                  <img src={api(item.thumbnail_url)} alt={item.title} loading="lazy" />
                ) : (
                  <div className="sd-placeholder">{item.media_type}</div>
                )}
                {item.status && item.status !== 'ready' && <span className="sd-status">{item.status}</span>}
              </div>
              <div className="sd-card-body">
                <div className="sd-card-title">{item.title}</div>
                <div className="sd-card-meta">
                  <span>{item.media_type}</span>
                  {typeof item.score === 'number' && <span>{Math.round(item.score * 100)}%</span>}
                </div>
                {item.match && <p className="sd-match">{item.match.type}: {item.match.text}</p>}
                {!!item.tags.length && <div className="sd-tags">{item.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}</div>}
              </div>
              <div className="sd-actions" onClick={(event) => event.stopPropagation()}>
                <button onClick={() => copyImageToClipboard(item)}>Copy</button>
                <a href={api(item.download_url)}>Download</a>
                <button onClick={() => createShare(item.id).catch((err) => setError(err.message))}>Share</button>
              </div>
            </article>
          ))}
        </section>
      </section>

      {detail && (
        <aside className="sd-drawer">
          <button className="sd-close" onClick={() => { setSelectedId(null); setSharePayload(null); }}>×</button>
          <h2>{detail.display_title || detail.original_filename}</h2>
          <div className="sd-preview">
            {detail.media_type === 'image' && <img src={api(detail.raw_url)} alt={detail.display_title || detail.original_filename} />}
            {detail.media_type === 'video' && <video src={api(detail.raw_url)} poster={detail.thumbnail_url ? api(detail.thumbnail_url) : undefined} controls />}
            {detail.media_type === 'audio' && <audio src={api(detail.raw_url)} controls />}
          </div>
          <div className="sd-detail-row"><b>Status</b><span>{detail.processing_status}</span></div>
          <div className="sd-detail-row"><b>Size</b><span>{formatBytes(detail.file_size_bytes)}</span></div>
          <div className="sd-detail-row"><b>Type</b><span>{detail.mime_type}</span></div>
          <div className="sd-drawer-actions">
            <button onClick={() => copyRawUrl(detail.raw_url)}>Copy raw URL</button>
            <a href={api(detail.download_url)}>Download</a>
            <button onClick={() => createShare(detail.id).catch((err) => setError(err.message))}>Copy share link</button>
          </div>
          {sharePayload && (
            <div className="sd-share-box">
              <strong>Share copied</strong>
              <input readOnly value={String(sharePayload.share_url || '')} onFocus={(event) => event.currentTarget.select()} />
              <textarea readOnly value={String((sharePayload.embed as unknown as Record<string, string>)?.iframe || '')} />
            </div>
          )}
          <Extraction title="Visual summary" text={detail.visual_summary} />
          <Extraction title="OCR" text={detail.ocr_text} />
          <Extraction title="Transcript" text={detail.transcript} />
        </aside>
      )}
    </main>
  );
}

function Extraction({ title, text }: { title: string; text?: string | null }) {
  if (!text) return null;
  return (
    <section className="sd-extraction">
      <h3>{title}</h3>
      <pre>{text}</pre>
    </section>
  );
}
