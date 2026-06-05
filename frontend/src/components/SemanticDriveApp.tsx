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

type ActionFeedback = {
  id: number;
  message: string;
  tone: 'success' | 'error';
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

function isLiveStatus(status?: string | null) {
  return Boolean(status && status !== 'ready' && status !== 'failed');
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
    created_at: asset.created_at,
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
    created_at: result.created_at,
  };
}

export default function SemanticDriveApp() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [sharePayload, setSharePayload] = useState<Record<string, string> | null>(null);
  const [activeType, setActiveType] = useState<string>('all');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [detailDescriptionDraft, setDetailDescriptionDraft] = useState('');
  const [detailTagsDraft, setDetailTagsDraft] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);
  const [deletingExtractions, setDeletingExtractions] = useState<Set<string>>(() => new Set());
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const actionFeedbackTimerRef = useRef<number | null>(null);
  const actionFeedbackIdRef = useRef(0);

  const showActionFeedback = useCallback(
    (message: string, tone: ActionFeedback['tone'] = 'success') => {
      if (actionFeedbackTimerRef.current !== null) {
        window.clearTimeout(actionFeedbackTimerRef.current);
      }
      actionFeedbackIdRef.current += 1;
      setActionFeedback({ id: actionFeedbackIdRef.current, message, tone });
      actionFeedbackTimerRef.current = window.setTimeout(() => {
        setActionFeedback(null);
        actionFeedbackTimerRef.current = null;
      }, 2600);
    },
    [],
  );

  const reportActionError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      const message = err instanceof Error ? err.message : fallbackMessage;
      setError(message);
      showActionFeedback(message, 'error');
    },
    [showActionFeedback],
  );

  const addPendingFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setPendingFiles((current) => {
      const seen = new Set(current.map((file) => fileKey(file)));
      const next = [...current];
      for (const file of files) {
        const key = fileKey(file);
        if (!seen.has(key)) {
          seen.add(key);
          next.push(file);
        }
      }
      return next;
    });
    setError(null);
    setUploadModalOpen(true);
  }, []);

  const loadAssets = useCallback(async () => {
    const response = await fetch(api('/api/assets'));
    if (!response.ok) throw new Error('Failed to load assets');
    setAssets(await response.json());
  }, []);

  const fetchAssetDetail = useCallback(async (assetId: string) => {
    const response = await fetch(api(`/api/assets/${assetId}`));
    if (!response.ok) throw new Error('Could not load asset detail');
    return (await response.json()) as AssetDetail;
  }, []);

  useEffect(() => {
    loadAssets().catch((err) => setError(err.message));
  }, [loadAssets]);

  useEffect(
    () => () => {
      if (actionFeedbackTimerRef.current !== null) {
        window.clearTimeout(actionFeedbackTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const source = new EventSource(api('/api/events'));
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type !== 'asset_processing_update') return;
      setAssets((current) =>
        current.map((asset) =>
          asset.id === payload.asset_id ? { ...asset, processing_status: payload.status } : asset,
        ),
      );
      setDetail((current) =>
        current?.id === payload.asset_id
          ? { ...current, processing_status: payload.status }
          : current,
      );
      if (
        payload.status === 'ready' ||
        payload.status === 'failed' ||
        payload.step === 'thumbnail ready'
      ) {
        loadAssets().catch(() => undefined);
        if (selectedIdRef.current === payload.asset_id) {
          fetchAssetDetail(payload.asset_id)
            .then((nextDetail) => {
              if (selectedIdRef.current === nextDetail.id) setDetail(nextDetail);
            })
            .catch(() => undefined);
        }
      }
    };
    return () => source.close();
  }, [fetchAssetDetail, loadAssets]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length) addPendingFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addPendingFiles]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    fetchAssetDetail(selectedId)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch((err) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [fetchAssetDetail, selectedId]);

  useEffect(() => {
    if (!detail) {
      setDetailDescriptionDraft('');
      setDetailTagsDraft('');
      return;
    }
    setDetailDescriptionDraft(detail.description ?? '');
    setDetailTagsDraft(detail.tags.map((tag) => tag.name).join(', '));
  }, [detail?.id]);

  const displayed = useMemo(() => {
    const source: DisplayItem[] = query.trim()
      ? results.map(resultToDisplay)
      : assets.map(assetToDisplay);
    if (activeType === 'all') return source;
    return source.filter((item) => item.media_type === activeType);
  }, [assets, results, query, activeType]);

  const detailTagNames = useMemo(() => parseTagNames(detailTagsDraft), [detailTagsDraft]);
  const detailHasChanges = useMemo(() => {
    if (!detail) return false;
    return (
      (detail.description ?? '') !== detailDescriptionDraft ||
      detail.tags.map((tag) => tag.name).join('\n') !== detailTagNames.join('\n')
    );
  }, [detail, detailDescriptionDraft, detailTagNames]);

  const hasLiveWork = useMemo(
    () =>
      assets.some((asset) => isLiveStatus(asset.processing_status)) ||
      Boolean(detail && isLiveStatus(detail.processing_status)),
    [assets, detail],
  );

  useEffect(() => {
    if (!hasLiveWork) return;
    const timer = window.setInterval(() => {
      loadAssets().catch(() => undefined);
      const currentSelectedId = selectedIdRef.current;
      if (currentSelectedId) {
        fetchAssetDetail(currentSelectedId)
          .then((nextDetail) => {
            if (selectedIdRef.current === nextDetail.id) setDetail(nextDetail);
          })
          .catch(() => undefined);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [fetchAssetDetail, hasLiveWork, loadAssets]);

  function removePendingFile(index: number) {
    setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function resetUploadForm() {
    setPendingFiles([]);
    setUploadDescription('');
    setUploadTags('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function closeUploadModal() {
    if (uploading) return;
    setUploadModalOpen(false);
    resetUploadForm();
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    await uploadFiles(pendingFiles, {
      description: uploadDescription,
      tags: uploadTags,
    });
  }

  async function uploadFiles(files: File[], metadata: { description: string; tags: string }) {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    const description = metadata.description.trim();
    const tagNames = parseTagNames(metadata.tags);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('title', file.name);
        if (description) form.append('description', description);
        if (tagNames.length) form.append('tag_names', tagNames.join(','));
        const response = await fetch(api('/api/assets'), { method: 'POST', body: form });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || `Upload failed for ${file.name}`);
        }
        const asset = (await response.json()) as Asset;
        setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      }
      setUploadModalOpen(false);
      resetUploadForm();
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
          rerank: true,
        }),
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
      body: JSON.stringify({ allow_download: true }),
    });
    if (!response.ok) throw new Error('Could not create share link');
    const payload = await response.json();
    setSharePayload(payload);
    await copyTextToClipboard(payload.share_url);
    showActionFeedback('Share link copied to clipboard');
  }

  async function saveDetailMetadata(event: FormEvent) {
    event.preventDefault();
    if (!detail || savingDetail) return;
    const assetId = detail.id;
    const previousStatus = detail.processing_status;
    setSavingDetail(true);
    setError(null);
    setDetail((current) =>
      current?.id === assetId ? { ...current, processing_status: 'embedding' } : current,
    );
    setAssets((current) =>
      current.map((asset) =>
        asset.id === assetId ? { ...asset, processing_status: 'embedding' } : asset,
      ),
    );
    try {
      const response = await fetch(api(`/api/assets/${assetId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: detailDescriptionDraft.trim(),
          tag_names: detailTagNames,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Could not save metadata');
      }
      const asset = (await response.json()) as Asset;
      const tagNames = asset.tags.map((tag) => tag.name);
      setAssets((current) => current.map((item) => (item.id === asset.id ? asset : item)));
      setResults((current) =>
        current.map((result) =>
          result.asset_id === asset.id
            ? { ...result, title: asset.display_title || asset.original_filename, tags: tagNames }
            : result,
        ),
      );
      setDetail((current) => (current?.id === asset.id ? { ...current, ...asset } : current));
      setDetailDescriptionDraft(asset.description ?? '');
      setDetailTagsDraft(tagNames.join(', '));
      if (query.trim()) {
        await runSearch();
      }
    } catch (err) {
      setDetail((current) =>
        current?.id === assetId ? { ...current, processing_status: previousStatus } : current,
      );
      setAssets((current) =>
        current.map((asset) =>
          asset.id === assetId ? { ...asset, processing_status: previousStatus } : asset,
        ),
      );
      setError(err instanceof Error ? err.message : 'Could not save metadata');
    } finally {
      setSavingDetail(false);
    }
  }

  async function deleteExtraction(extractionType: string) {
    if (!detail || deletingExtractions.has(extractionType)) return;
    const assetId = detail.id;
    const previousStatus = detail.processing_status;
    setDeletingExtractions((current) => new Set(current).add(extractionType));
    setError(null);
    setDetail((current) =>
      current?.id === assetId ? { ...current, processing_status: 'embedding' } : current,
    );
    setAssets((current) =>
      current.map((asset) =>
        asset.id === assetId ? { ...asset, processing_status: 'embedding' } : asset,
      ),
    );
    try {
      const response = await fetch(api(`/api/assets/${assetId}/extractions/${extractionType}`), {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Could not delete extraction');
      }
      const nextDetail = (await response.json()) as AssetDetail;
      setDetail(nextDetail);
      setAssets((current) =>
        current.map((asset) => (asset.id === nextDetail.id ? nextDetail : asset)),
      );
      if (query.trim()) {
        await runSearch();
      }
    } catch (err) {
      setDetail((current) =>
        current?.id === assetId ? { ...current, processing_status: previousStatus } : current,
      );
      setAssets((current) =>
        current.map((asset) =>
          asset.id === assetId ? { ...asset, processing_status: previousStatus } : asset,
        ),
      );
      setError(err instanceof Error ? err.message : 'Could not delete extraction');
    } finally {
      setDeletingExtractions((current) => {
        const next = new Set(current);
        next.delete(extractionType);
        return next;
      });
    }
  }

  async function retryProcessing(assetId: string) {
    setRetryingIds((current) => new Set(current).add(assetId));
    setError(null);
    try {
      const response = await fetch(api(`/api/assets/${assetId}/retry`), { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Could not retry processing');
      }
      const asset = (await response.json()) as Asset;
      setAssets((current) => current.map((item) => (item.id === asset.id ? asset : item)));
      setResults([]);
      if (detail?.id === asset.id) {
        setDetail({ ...detail, ...asset });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry processing');
    } finally {
      setRetryingIds((current) => {
        const next = new Set(current);
        next.delete(assetId);
        return next;
      });
    }
  }

  async function copyRawUrl(path: string) {
    await copyTextToClipboard(api(path));
    showActionFeedback('Link copied to clipboard');
  }

  async function copyImageToClipboard(item: DisplayItem) {
    if (!item.mime_type.startsWith('image/')) {
      await copyRawUrl(item.raw_url);
      return;
    }
    try {
      await copyImageUrlToClipboard(api(item.raw_url));
      showActionFeedback('Image copied to clipboard');
    } catch {
      await copyTextToClipboard(api(item.raw_url));
      showActionFeedback('Image URL copied to clipboard');
    }
  }

  return (
    <main className="sd-app">
      <aside className="sd-sidebar">
        <div className="sd-logo">Semantic Drive</div>
        <button
          className={activeType === 'all' ? 'active' : ''}
          onClick={() => setActiveType('all')}
        >
          All
        </button>
        <button
          className={activeType === 'image' ? 'active' : ''}
          onClick={() => setActiveType('image')}
        >
          Images
        </button>
        <button
          className={activeType === 'video' ? 'active' : ''}
          onClick={() => setActiveType('video')}
        >
          Videos
        </button>
        <button
          className={activeType === 'audio' ? 'active' : ''}
          onClick={() => setActiveType('audio')}
        >
          Audio
        </button>
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
          <button
            className="sd-upload-button"
            onClick={() => setUploadModalOpen(true)}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="image/*,audio/*,video/*"
            onChange={(event) => addPendingFiles(Array.from(event.target.files || []))}
          />
        </header>

        <div
          className="sd-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addPendingFiles(Array.from(event.dataTransfer.files || []));
          }}
        >
          <strong>Drop files here</strong>
          <span>
            Images get OCR/captions, audio gets transcript, videos get audio transcription.
          </span>
        </div>

        {error && <div className="sd-error">{error}</div>}

        <div className="sd-result-count">
          {query.trim()
            ? `${displayed.length} semantic result${displayed.length === 1 ? '' : 's'}`
            : `${displayed.length} file${displayed.length === 1 ? '' : 's'}`}
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
                <StatusIndicator status={item.status} />
              </div>
              <div className="sd-card-body">
                <div className="sd-card-title">{item.title}</div>
                <div className="sd-card-meta">
                  <span>{item.media_type}</span>
                  {typeof item.score === 'number' && <span>{Math.round(item.score * 100)}%</span>}
                </div>
                {item.match && (
                  <p className="sd-match">
                    {item.match.type}: {item.match.text}
                  </p>
                )}
                {!!item.tags.length && (
                  <div className="sd-tags">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="sd-actions" onClick={(event) => event.stopPropagation()}>
                <button
                  onClick={() =>
                    copyImageToClipboard(item).catch((err) => reportActionError(err, 'Copy failed'))
                  }
                >
                  Copy
                </button>
                <a href={api(item.download_url)}>Download</a>
                <button
                  onClick={() =>
                    createShare(item.id).catch((err) =>
                      reportActionError(err, 'Could not create share link'),
                    )
                  }
                >
                  Share
                </button>
                {item.status === 'failed' && (
                  <button
                    onClick={() => retryProcessing(item.id)}
                    disabled={retryingIds.has(item.id)}
                  >
                    {retryingIds.has(item.id) ? 'Retrying...' : 'Retry'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      </section>

      {detail && (
        <aside className="sd-drawer">
          <button
            className="sd-close"
            onClick={() => {
              setSelectedId(null);
              setSharePayload(null);
            }}
          >
            ×
          </button>
          <h2>{detail.display_title || detail.original_filename}</h2>
          <div className="sd-detail-meta">
            {detail.mime_type} · {formatBytes(detail.file_size_bytes)} · {detail.processing_status}
          </div>
          <div className="sd-preview">
            {detail.media_type === 'image' && (
              <img
                src={api(detail.raw_url)}
                alt={detail.display_title || detail.original_filename}
              />
            )}
            {detail.media_type === 'video' && (
              <video
                src={api(detail.raw_url)}
                poster={detail.thumbnail_url ? api(detail.thumbnail_url) : undefined}
                controls
              />
            )}
            {detail.media_type === 'audio' && <audio src={api(detail.raw_url)} controls />}
          </div>
          <form className="sd-detail-edit" onSubmit={saveDetailMetadata}>
            <label className="sd-field">
              <span>Description</span>
              <textarea
                value={detailDescriptionDraft}
                onChange={(event) => setDetailDescriptionDraft(event.target.value)}
                rows={5}
                placeholder="Add context, source, notes..."
              />
            </label>
            <label className="sd-field">
              <span>Tags</span>
              <input
                value={detailTagsDraft}
                onChange={(event) => setDetailTagsDraft(event.target.value)}
                placeholder="research, invoice, client-a"
              />
            </label>
            <div className="sd-detail-edit-actions">
              <button type="submit" disabled={!detailHasChanges || savingDetail}>
                {savingDetail && <InlineSpinner />}
                {savingDetail ? 'Updating search...' : 'Save metadata'}
              </button>
            </div>
          </form>
          <div className="sd-drawer-actions">
            <button
              onClick={() =>
                copyRawUrl(detail.raw_url).catch((err) => reportActionError(err, 'Copy failed'))
              }
            >
              Copy raw URL
            </button>
            <a href={api(detail.download_url)}>Download</a>
            <button
              onClick={() =>
                createShare(detail.id).catch((err) =>
                  reportActionError(err, 'Could not create share link'),
                )
              }
            >
              Copy share link
            </button>
            {detail.processing_status === 'failed' && (
              <button
                onClick={() => retryProcessing(detail.id)}
                disabled={retryingIds.has(detail.id)}
              >
                {retryingIds.has(detail.id) ? 'Retrying...' : 'Retry processing'}
              </button>
            )}
          </div>
          {sharePayload && (
            <div className="sd-share-box">
              <strong>Share copied</strong>
              <input
                readOnly
                value={String(sharePayload.share_url || '')}
                onFocus={(event) => event.currentTarget.select()}
              />
              <textarea
                readOnly
                value={String(
                  (sharePayload.embed as unknown as Record<string, string>)?.iframe || '',
                )}
              />
            </div>
          )}
          <Extraction
            title="Visual summary"
            text={detail.visual_summary}
            deleting={deletingExtractions.has('visual_summary')}
            onDelete={() => deleteExtraction('visual_summary')}
          />
          <Extraction
            title="OCR"
            text={detail.ocr_text}
            deleting={deletingExtractions.has('ocr')}
            onDelete={() => deleteExtraction('ocr')}
          />
          <Extraction
            title="Transcript"
            text={detail.transcript}
            deleting={deletingExtractions.has('transcript')}
            onDelete={() => deleteExtraction('transcript')}
          />
        </aside>
      )}

      {actionFeedback && (
        <div
          key={actionFeedback.id}
          className={`sd-action-toast sd-action-toast-${actionFeedback.tone}`}
          role="status"
          aria-live="polite"
        >
          <svg className="sd-action-toast-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="sd-action-toast-ring" cx="12" cy="12" r="9" />
            <path className="sd-action-toast-check" d="M7.6 12.3l2.9 2.9 5.9-6.4" />
          </svg>
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {uploadModalOpen && (
        <div
          className="sd-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeUploadModal();
          }}
        >
          <form className="sd-upload-modal" onSubmit={submitUpload}>
            <button type="button" className="sd-close" onClick={closeUploadModal}>
              ×
            </button>
            <h2>Upload content</h2>

            <button
              type="button"
              className="sd-file-picker"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose files
            </button>

            <div
              className="sd-upload-drop"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addPendingFiles(Array.from(event.dataTransfer.files || []));
              }}
            >
              <strong>Drop files</strong>
              <span>
                {pendingFiles.length ? `${pendingFiles.length} selected` : 'No files selected'}
              </span>
            </div>

            {!!pendingFiles.length && (
              <ul className="sd-file-list">
                {pendingFiles.map((file, index) => (
                  <li key={fileKey(file)}>
                    <PendingFileThumb file={file} />
                    <span className="sd-file-name">{file.name}</span>
                    <small>
                      {file.type || 'file'} · {formatBytes(file.size)}
                    </small>
                    <button type="button" onClick={() => removePendingFile(index)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <label className="sd-field">
              <span>Description</span>
              <textarea
                value={uploadDescription}
                onChange={(event) => setUploadDescription(event.target.value)}
                rows={4}
                placeholder="Project notes, source, context..."
              />
            </label>

            <label className="sd-field">
              <span>Tags</span>
              <input
                value={uploadTags}
                onChange={(event) => setUploadTags(event.target.value)}
                placeholder="research, invoice, client-a"
              />
            </label>

            <div className="sd-modal-actions">
              <button type="button" onClick={closeUploadModal} disabled={uploading}>
                Cancel
              </button>
              <button type="submit" disabled={uploading || !pendingFiles.length}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  activeElement?.focus();
  if (!copied) throw new Error('Clipboard is unavailable');
}

async function copyImageUrlToClipboard(url: string) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image clipboard is unavailable');
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load image for copying');
  const sourceBlob = await response.blob();
  const clipboardBlob =
    sourceBlob.type === 'image/png' ? sourceBlob : await convertImageBlobToPng(sourceBlob);
  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': clipboardBlob,
    }),
  ]);
}

async function convertImageBlobToPng(blob: Blob) {
  const image = await loadImageFromBlob(blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Could not read image dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare image for copying');
  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((pngBlob) => {
      if (pngBlob) {
        resolve(pngBlob);
      } else {
        reject(new Error('Could not prepare image for copying'));
      }
    }, 'image/png');
  });
}

function loadImageFromBlob(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image for copying'));
    };
    image.src = url;
  });
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function parseTagNames(raw: string) {
  const seen = new Set<string>();
  return raw
    .split(/[,\n]/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
}

function PendingFileThumb({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImageFile(file)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (previewUrl) {
    return <img className="sd-file-thumb" src={previewUrl} alt="" />;
  }

  return (
    <span className="sd-file-thumb sd-file-thumb-placeholder">
      {file.type.split('/')[0] || 'file'}
    </span>
  );
}

function StatusIndicator({ status }: { status?: string }) {
  if (!status || status === 'ready') return null;
  if (status === 'failed') {
    return (
      <span
        className="sd-status-indicator sd-status-indicator-failed"
        title="Processing failed"
        aria-label="Processing failed"
      >
        !
      </span>
    );
  }
  return (
    <span
      className="sd-status-indicator sd-status-indicator-active"
      title={status}
      aria-label={`Processing status: ${status}`}
    >
      <span className="sd-spinner" />
    </span>
  );
}

function InlineSpinner() {
  return <span className="sd-inline-spinner" aria-hidden="true" />;
}

function Extraction({
  title,
  text,
  deleting,
  onDelete,
}: {
  title: string;
  text?: string | null;
  deleting?: boolean;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <section className="sd-extraction">
      <div className="sd-extraction-header">
        <button
          type="button"
          className="sd-extraction-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{open ? '-' : '+'}</span>
          {title}
        </button>
        {onDelete && (
          <button
            type="button"
            className="sd-extraction-delete"
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting && <InlineSpinner />}
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>
      {open && <pre>{text}</pre>}
    </section>
  );
}
