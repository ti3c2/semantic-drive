import type { FormEvent, ReactNode } from 'react';
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
  trashed_at?: string | null;
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

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4" />
      <path d="m15.4 6.5-6.8 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v2" />
      <path d="M19 6l-1 14c-.1 1.1-1 2-2.1 2H8.1c-1.1 0-2-.9-2.1-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ImageIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L8 18" />
    </svg>
  );
}

function VideoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m16 13 5.2 3.4c.7.5 1.8 0 1.8-.9v-7c0-.9-1-1.4-1.8-.9L16 11" />
      <rect width="14" height="12" x="2" y="6" rx="2" />
    </svg>
  );
}

function AudioIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function SidebarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m16 9-3 3 3 3" />
    </svg>
  );
}

function mediaTypeLabel(mediaType: string) {
  if (mediaType === 'image') return 'Image';
  if (mediaType === 'video') return 'Video';
  if (mediaType === 'audio') return 'Audio';
  return mediaType || 'File';
}

function MediaTypeIcon({ mediaType, size = 18 }: { mediaType: string; size?: number }) {
  if (mediaType === 'image') return <ImageIcon size={size} />;
  if (mediaType === 'video') return <VideoIcon size={size} />;
  if (mediaType === 'audio') return <AudioIcon size={size} />;
  return <span className="sd-media-fallback">{mediaTypeLabel(mediaType)}</span>;
}

function IconOnlyAction({ children, label }: { children: ReactNode; label: string }) {
  return (
    <>
      <span className="sd-action-icon" aria-hidden="true">
        {children}
      </span>
      <span className="sd-sr-only">{label}</span>
    </>
  );
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
  const [trashAssets, setTrashAssets] = useState<Asset[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());
  const [trashingIds, setTrashingIds] = useState<Set<string>>(() => new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(() => new Set());
  const [purgingIds, setPurgingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [sharePayload, setSharePayload] = useState<Record<string, string> | null>(null);
  const [activeType, setActiveType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'library' | 'trash'>('library');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [detailDescriptionDraft, setDetailDescriptionDraft] = useState('');
  const [detailTagsDraft, setDetailTagsDraft] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);
  const [deletingExtractions, setDeletingExtractions] = useState<Set<string>>(() => new Set());
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detailDrawerRef = useRef<HTMLElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const actionFeedbackTimerRef = useRef<number | null>(null);
  const actionFeedbackIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const searchDebounceTimerRef = useRef<number | null>(null);
  const skipInitialSearchRef = useRef(true);

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
    const [assetResponse, trashResponse] = await Promise.all([
      fetch(api('/api/assets')),
      fetch(api('/api/assets?trashed=true')),
    ]);
    if (!assetResponse.ok) throw new Error('Failed to load assets');
    if (!trashResponse.ok) throw new Error('Failed to load trash');
    const [activeItems, trashItems] = await Promise.all([
      assetResponse.json() as Promise<Asset[]>,
      trashResponse.json() as Promise<Asset[]>,
    ]);
    setAssets(activeItems);
    setTrashAssets(trashItems);
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

  const closeDetailDrawer = useCallback(() => {
    setSelectedId(null);
    setSharePayload(null);
  }, []);

  useEffect(() => {
    if (!detail) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const drawer = detailDrawerRef.current;
      const target = event.target;
      if (!drawer || !(target instanceof Node) || drawer.contains(target)) return;
      closeDetailDrawer();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [closeDetailDrawer, detail]);

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

  const isTrashView = viewMode === 'trash';

  const displayed = useMemo(() => {
    const source: DisplayItem[] = isTrashView
      ? trashAssets.map(assetToDisplay)
      : query.trim()
        ? results.map(resultToDisplay)
        : assets.map(assetToDisplay);
    if (activeType === 'all') return source;
    return source.filter((item) => item.media_type === activeType);
  }, [activeType, assets, isTrashView, query, results, trashAssets]);

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

  const runSearch = useCallback(
    async (event?: FormEvent, nextQuery = query, nextActiveType = activeType) => {
      event?.preventDefault();
      if (viewMode === 'trash') {
        setResults([]);
        setSearching(false);
        return;
      }
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      const trimmed = nextQuery.trim();
      if (!trimmed) {
        setResults([]);
        setSearching(false);
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
            filters: { media_types: nextActiveType === 'all' ? [] : [nextActiveType] },
            limit: 50,
            rerank: true,
          }),
        });
        if (!response.ok) throw new Error('Search failed');
        const payload = await response.json();
        if (searchRequestIdRef.current === requestId) {
          setResults(payload.results || []);
        }
      } catch (err) {
        if (searchRequestIdRef.current === requestId) {
          setError(err instanceof Error ? err.message : 'Search failed');
        }
      } finally {
        if (searchRequestIdRef.current === requestId) {
          setSearching(false);
        }
      }
    },
    [activeType, loadAssets, query, viewMode],
  );

  useEffect(() => {
    if (viewMode === 'trash') {
      setResults([]);
      setSearching(false);
      return;
    }
    if (skipInitialSearchRef.current) {
      skipInitialSearchRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      runSearch(undefined, query, activeType).catch(() => undefined);
      if (searchDebounceTimerRef.current === timer) {
        searchDebounceTimerRef.current = null;
      }
    }, 250);
    searchDebounceTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (searchDebounceTimerRef.current === timer) {
        searchDebounceTimerRef.current = null;
      }
    };
  }, [activeType, query, runSearch, viewMode]);

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

  async function moveAssetToTrash(assetId: string) {
    if (trashingIds.has(assetId)) return;
    setTrashingIds((current) => new Set(current).add(assetId));
    setError(null);
    try {
      const response = await fetch(api(`/api/assets/${assetId}`), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Could not move file to trash');
      }
      setResults((current) => current.filter((result) => result.asset_id !== assetId));
      if (selectedIdRef.current === assetId) {
        setSelectedId(null);
        setDetail(null);
        setSharePayload(null);
      }
      await loadAssets();
      showActionFeedback('Moved to trash');
    } catch (err) {
      reportActionError(err, 'Could not move file to trash');
    } finally {
      setTrashingIds((current) => {
        const next = new Set(current);
        next.delete(assetId);
        return next;
      });
    }
  }

  async function restoreAsset(assetId: string) {
    if (restoringIds.has(assetId)) return;
    setRestoringIds((current) => new Set(current).add(assetId));
    setError(null);
    try {
      const response = await fetch(api(`/api/assets/${assetId}/restore`), { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Could not restore file');
      }
      const asset = (await response.json()) as Asset;
      setTrashAssets((current) => current.filter((item) => item.id !== assetId));
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      showActionFeedback('Restored');
    } catch (err) {
      reportActionError(err, 'Could not restore file');
    } finally {
      setRestoringIds((current) => {
        const next = new Set(current);
        next.delete(assetId);
        return next;
      });
    }
  }

  async function purgeAsset(assetId: string) {
    if (purgingIds.has(assetId)) return;
    if (!window.confirm('Delete this file forever?')) return;
    setPurgingIds((current) => new Set(current).add(assetId));
    setError(null);
    try {
      const response = await fetch(api(`/api/assets/${assetId}/purge`), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Could not delete file forever');
      }
      setTrashAssets((current) => current.filter((item) => item.id !== assetId));
      showActionFeedback('Deleted forever');
    } catch (err) {
      reportActionError(err, 'Could not delete file forever');
    } finally {
      setPurgingIds((current) => {
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

  function selectLibraryType(type: string) {
    setViewMode('library');
    setActiveType(type);
  }

  function selectTrashView() {
    setViewMode('trash');
    setQuery('');
    setResults([]);
    setSelectedId(null);
    setDetail(null);
    setSharePayload(null);
  }

  return (
    <main className={`sd-app${isSidebarOpen ? '' : ' sd-app-sidebar-collapsed'}`}>
      {!isSidebarOpen && (
        <button
          className="sd-sidebar-open-button"
          type="button"
          aria-controls="sd-sidebar"
          aria-expanded={isSidebarOpen}
          title="Show sidebar"
          onClick={() => setIsSidebarOpen(true)}
        >
          <IconOnlyAction label="Show sidebar">
            <SidebarIcon />
          </IconOnlyAction>
        </button>
      )}
      <aside className="sd-sidebar" id="sd-sidebar">
        <div className="sd-sidebar-heading">
          <button
            className="sd-sidebar-close"
            type="button"
            aria-controls="sd-sidebar"
            aria-expanded={isSidebarOpen}
            title="Hide sidebar"
            onClick={() => setIsSidebarOpen(false)}
          >
            <IconOnlyAction label="Hide sidebar">
              <CloseIcon />
            </IconOnlyAction>
          </button>
          <div className="sd-logo">Semantic Drive</div>
        </div>
        <button
          className={viewMode === 'library' && activeType === 'all' ? 'active' : ''}
          onClick={() => selectLibraryType('all')}
        >
          All
        </button>
        <button
          className={viewMode === 'library' && activeType === 'image' ? 'active' : ''}
          onClick={() => selectLibraryType('image')}
        >
          Images
        </button>
        <button
          className={viewMode === 'library' && activeType === 'video' ? 'active' : ''}
          onClick={() => selectLibraryType('video')}
        >
          Videos
        </button>
        <button
          className={viewMode === 'library' && activeType === 'audio' ? 'active' : ''}
          onClick={() => selectLibraryType('audio')}
        >
          Audio
        </button>
        <button className={viewMode === 'trash' ? 'active' : ''} onClick={selectTrashView}>
          Trash
        </button>
        <div className="sd-sidebar-note">Paste, drop, search. No ceremonial onboarding parade.</div>
      </aside>

      <section className="sd-main">
        <header className="sd-header">
          <form onSubmit={runSearch} className="sd-search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isTrashView ? 'Trash' : 'Search text, speech, screenshots, tags...'}
              disabled={isTrashView}
              autoFocus
            />
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

        {!isTrashView && (
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
        )}

        {error && <div className="sd-error">{error}</div>}

        <div className="sd-result-count">
          {isTrashView
            ? `${displayed.length} trashed file${displayed.length === 1 ? '' : 's'}`
            : query.trim()
              ? `${displayed.length} semantic result${displayed.length === 1 ? '' : 's'}`
              : `${displayed.length} file${displayed.length === 1 ? '' : 's'}`}
        </div>

        <section className="sd-grid">
          {displayed.map((item) => (
            <article
              key={item.id}
              className={`sd-card${isTrashView ? ' sd-card-muted' : ''}`}
              onClick={() => {
                if (!isTrashView) setSelectedId(item.id);
              }}
            >
              <div className="sd-thumb">
                {item.thumbnail_url ? (
                  <img src={api(item.thumbnail_url)} alt={item.title} loading="lazy" />
                ) : (
                  <div className="sd-placeholder" title={mediaTypeLabel(item.media_type)}>
                    <MediaTypeIcon mediaType={item.media_type} size={42} />
                    <span className="sd-sr-only">{mediaTypeLabel(item.media_type)}</span>
                  </div>
                )}
                <StatusIndicator status={item.status} />
              </div>
              <div className="sd-card-body">
                <div className="sd-card-title">
                  <span className="sd-card-title-text">{item.title}</span>
                  <span
                    className="sd-card-title-media-icon"
                    title={mediaTypeLabel(item.media_type)}
                  >
                    <MediaTypeIcon mediaType={item.media_type} />
                    <span className="sd-sr-only">{mediaTypeLabel(item.media_type)}</span>
                  </span>
                </div>
                {typeof item.score === 'number' && (
                  <div className="sd-card-meta">
                    <span>{Math.round(item.score * 100)}%</span>
                  </div>
                )}
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
                {isTrashView ? (
                  <>
                    <button
                      className="sd-restore-action"
                      onClick={() => restoreAsset(item.id)}
                      disabled={restoringIds.has(item.id)}
                    >
                      {restoringIds.has(item.id) ? 'Restoring...' : 'Restore'}
                    </button>
                    <button
                      className="sd-danger-action"
                      onClick={() => purgeAsset(item.id)}
                      disabled={purgingIds.has(item.id)}
                    >
                      {purgingIds.has(item.id) ? 'Deleting...' : 'Delete forever'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      aria-label="Copy"
                      title="Copy"
                      onClick={() =>
                        copyImageToClipboard(item).catch((err) =>
                          reportActionError(err, 'Copy failed'),
                        )
                      }
                    >
                      <IconOnlyAction label="Copy">
                        <CopyIcon />
                      </IconOnlyAction>
                    </button>
                    <a href={api(item.download_url)} aria-label="Download" title="Download">
                      <IconOnlyAction label="Download">
                        <DownloadIcon />
                      </IconOnlyAction>
                    </a>
                    <button
                      aria-label="Share"
                      title="Share"
                      onClick={() =>
                        createShare(item.id).catch((err) =>
                          reportActionError(err, 'Could not create share link'),
                        )
                      }
                    >
                      <IconOnlyAction label="Share">
                        <ShareIcon />
                      </IconOnlyAction>
                    </button>
                    <button
                      className="sd-danger-action"
                      aria-label={trashingIds.has(item.id) ? 'Moving to trash' : 'Trash'}
                      title={trashingIds.has(item.id) ? 'Moving to trash' : 'Trash'}
                      onClick={() => moveAssetToTrash(item.id)}
                      disabled={trashingIds.has(item.id)}
                    >
                      <IconOnlyAction
                        label={trashingIds.has(item.id) ? 'Moving to trash' : 'Trash'}
                      >
                        <TrashIcon />
                      </IconOnlyAction>
                    </button>
                  </>
                )}
                {!isTrashView && item.status === 'failed' && (
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
        <aside className="sd-drawer" ref={detailDrawerRef}>
          <button className="sd-close" onClick={closeDetailDrawer}>
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
              aria-label="Copy raw URL"
              title="Copy raw URL"
              onClick={() =>
                copyRawUrl(detail.raw_url).catch((err) => reportActionError(err, 'Copy failed'))
              }
            >
              <IconOnlyAction label="Copy raw URL">
                <CopyIcon />
              </IconOnlyAction>
            </button>
            <a href={api(detail.download_url)} aria-label="Download" title="Download">
              <IconOnlyAction label="Download">
                <DownloadIcon />
              </IconOnlyAction>
            </a>
            <button
              aria-label="Copy share link"
              title="Copy share link"
              onClick={() =>
                createShare(detail.id).catch((err) =>
                  reportActionError(err, 'Could not create share link'),
                )
              }
            >
              <IconOnlyAction label="Copy share link">
                <ShareIcon />
              </IconOnlyAction>
            </button>
            <button
              className="sd-danger-action"
              aria-label={trashingIds.has(detail.id) ? 'Moving to trash' : 'Move to trash'}
              title={trashingIds.has(detail.id) ? 'Moving to trash' : 'Move to trash'}
              onClick={() => moveAssetToTrash(detail.id)}
              disabled={trashingIds.has(detail.id)}
            >
              <IconOnlyAction
                label={trashingIds.has(detail.id) ? 'Moving to trash' : 'Move to trash'}
              >
                <TrashIcon />
              </IconOnlyAction>
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
