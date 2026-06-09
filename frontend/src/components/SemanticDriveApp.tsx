import type { FocusEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './SemanticDriveApp.css';
import { ActionToast } from './semantic-drive/ActionToast';
import { api } from './semantic-drive/api';
import { AssetGrid } from './semantic-drive/AssetGrid';
import { copyImageUrlToClipboard, copyTextToClipboard } from './semantic-drive/clipboard';
import { DetailDrawer } from './semantic-drive/DetailDrawer';
import { FileDropzone } from './semantic-drive/FileDropzone';
import {
  MEDIA_TYPE_FILTERS,
  MediaFilterBar,
  type MediaTypeFilter,
} from './semantic-drive/MediaFilterBar';
import { Sidebar } from './semantic-drive/Sidebar';
import type {
  ActionFeedback,
  Asset,
  AssetDetail,
  DisplayItem,
  SearchResult,
  SharePayload,
  ViewMode,
} from './semantic-drive/types';
import { UploadModal } from './semantic-drive/UploadModal';
import {
  assetToDisplay,
  fileKey,
  isLiveStatus,
  parseTagNames,
  resultToDisplay,
} from './semantic-drive/utils';

type AssetProcessingUpdatePayload = {
  type?: string;
  asset_id?: string;
  status?: string;
  step?: string;
};

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
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [activeMediaTypes, setActiveMediaTypes] = useState<MediaTypeFilter[]>(() => [
    ...MEDIA_TYPE_FILTERS,
  ]);
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [filenameDraft, setFilenameDraft] = useState('');
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [detailDescriptionDraft, setDetailDescriptionDraft] = useState('');
  const [detailTagsDraft, setDetailTagsDraft] = useState('');
  const [savingFilename, setSavingFilename] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);
  const [deletingExtractions, setDeletingExtractions] = useState<Set<string>>(() => new Set());
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const detailDrawerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const actionFeedbackTimerRef = useRef<number | null>(null);
  const actionFeedbackIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const searchDebounceTimerRef = useRef<number | null>(null);
  const skipInitialSearchRef = useRef(true);
  const searchBlurredAtRef = useRef<number | null>(null);
  const searchHadTextOnBlurRef = useRef(false);

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

  const handleSearchBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    const hasSearchText = event.currentTarget.value.trim().length > 0;
    searchHadTextOnBlurRef.current = hasSearchText;
    searchBlurredAtRef.current = hasSearchText ? Date.now() : null;
  }, []);

  const handleSearchFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
    const blurredAt = searchBlurredAtRef.current;
    if (!searchHadTextOnBlurRef.current || blurredAt === null) return;
    if (Date.now() - blurredAt < 2000 || event.currentTarget.value.length === 0) return;

    const input = event.currentTarget;
    window.setTimeout(() => input.select(), 0);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    searchHadTextOnBlurRef.current = false;
    searchBlurredAtRef.current = null;
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

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
      const payload = JSON.parse(event.data) as AssetProcessingUpdatePayload;
      if (payload.type !== 'asset_processing_update' || !payload.asset_id || !payload.status) {
        return;
      }
      const assetId = payload.asset_id;
      const status = payload.status;
      setAssets((current) =>
        current.map((asset) =>
          asset.id === assetId ? { ...asset, processing_status: status } : asset,
        ),
      );
      setDetail((current) =>
        current && current.id === assetId ? { ...current, processing_status: status } : current,
      );
      if (status === 'ready' || status === 'failed' || payload.step === 'thumbnail ready') {
        loadAssets().catch(() => undefined);
        if (selectedIdRef.current === assetId) {
          fetchAssetDetail(assetId)
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

  useEffect(() => {
    if (!detail) {
      setFilenameDraft('');
      setIsEditingFilename(false);
      return;
    }
    if (!isEditingFilename) {
      setFilenameDraft(detail.original_filename);
    }
  }, [detail?.id, detail?.original_filename, isEditingFilename]);

  const isTrashView = viewMode === 'trash';

  const displayed = useMemo(() => {
    if (isTrashView) return trashAssets.map(assetToDisplay);

    const source: DisplayItem[] = query.trim()
      ? results.map(resultToDisplay)
      : assets.map(assetToDisplay);
    if (activeMediaTypes.length === MEDIA_TYPE_FILTERS.length) return source;

    const activeMediaTypeSet = new Set<string>(activeMediaTypes);
    return source.filter((item) => activeMediaTypeSet.has(item.media_type));
  }, [activeMediaTypes, assets, isTrashView, query, results, trashAssets]);

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

  function openFilePicker() {
    fileInputRef.current?.click();
  }

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
    async (event?: FormEvent, nextQuery = query, nextActiveMediaTypes = activeMediaTypes) => {
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
            filters: {
              media_types:
                nextActiveMediaTypes.length === MEDIA_TYPE_FILTERS.length
                  ? []
                  : [...nextActiveMediaTypes],
            },
            limit: 50,
            rerank: true,
          }),
        });
        if (!response.ok) throw new Error('Search failed');
        const payload = (await response.json()) as { results?: SearchResult[] };
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
    [activeMediaTypes, loadAssets, query, viewMode],
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
      runSearch(undefined, query, activeMediaTypes).catch(() => undefined);
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
  }, [activeMediaTypes, query, runSearch, viewMode]);

  async function createShare(assetId: string) {
    setSharePayload(null);
    const response = await fetch(api(`/api/assets/${assetId}/shares`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allow_download: true }),
    });
    if (!response.ok) throw new Error('Could not create share link');
    const payload = (await response.json()) as SharePayload;
    const shareUrl = typeof payload.share_url === 'string' ? payload.share_url : '';
    if (!shareUrl) throw new Error('Share response did not include a link');
    setSharePayload(payload);
    await copyTextToClipboard(shareUrl);
    showActionFeedback('Share link copied to clipboard');
  }

  function applyAssetUpdate(asset: Asset) {
    const tagNames = asset.tags.map((tag) => tag.name);
    setAssets((current) => current.map((item) => (item.id === asset.id ? asset : item)));
    setTrashAssets((current) => current.map((item) => (item.id === asset.id ? asset : item)));
    setResults((current) =>
      current.map((result) =>
        result.asset_id === asset.id
          ? {
              ...result,
              title: asset.display_title || asset.original_filename,
              original_filename: asset.original_filename,
              tags: tagNames,
            }
          : result,
      ),
    );
    setDetail((current) => (current?.id === asset.id ? { ...current, ...asset } : current));
  }

  function startFilenameEdit() {
    if (!detail || savingFilename) return;
    setFilenameDraft(detail.original_filename);
    setIsEditingFilename(true);
  }

  function cancelFilenameEdit() {
    setFilenameDraft(detail?.original_filename ?? '');
    setIsEditingFilename(false);
  }

  async function saveFilename() {
    if (!detail || savingFilename) return;
    const nextFilename = filenameDraft.trim();
    if (!nextFilename) {
      setError('Filename cannot be blank');
      return;
    }
    if (nextFilename === detail.original_filename) {
      setFilenameDraft(detail.original_filename);
      setIsEditingFilename(false);
      return;
    }

    const assetId = detail.id;
    const previousStatus = detail.processing_status;
    setSavingFilename(true);
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
        body: JSON.stringify({ original_filename: nextFilename }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message =
          typeof payload.detail === 'string' ? payload.detail : 'Could not save filename';
        throw new Error(message);
      }
      const asset = (await response.json()) as Asset;
      applyAssetUpdate(asset);
      setFilenameDraft(asset.original_filename);
      setIsEditingFilename(false);
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
      setError(err instanceof Error ? err.message : 'Could not save filename');
    } finally {
      setSavingFilename(false);
    }
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
      applyAssetUpdate(asset);
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

  function copyItemToClipboard(item: DisplayItem) {
    copyImageToClipboard(item).catch((err) => reportActionError(err, 'Copy failed'));
  }

  function copyRawUrlSafely(path: string) {
    copyRawUrl(path).catch((err) => reportActionError(err, 'Copy failed'));
  }

  function createShareSafely(assetId: string) {
    createShare(assetId).catch((err) => reportActionError(err, 'Could not create share link'));
  }

  function toggleMediaTypeFilter(mediaType: MediaTypeFilter) {
    setViewMode('library');
    setActiveMediaTypes((current) => {
      if (current.length === MEDIA_TYPE_FILTERS.length) return [mediaType];
      if (current.includes(mediaType)) {
        const next = current.filter((item) => item !== mediaType);
        return next.length ? next : [...MEDIA_TYPE_FILTERS];
      }
      return MEDIA_TYPE_FILTERS.filter((item) => item === mediaType || current.includes(item));
    });
  }

  function clearMediaFilters() {
    setViewMode('library');
    setActiveMediaTypes([...MEDIA_TYPE_FILTERS]);
  }

  function selectGalleryView() {
    setViewMode('library');
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
      <Sidebar
        isSidebarOpen={isSidebarOpen}
        viewMode={viewMode}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onSelectGalleryView={selectGalleryView}
        onSelectTrashView={selectTrashView}
      />

      <section className="sd-main">
        <header className="sd-header">
          <div className="sd-search-stack">
            <form onSubmit={runSearch} className="sd-search">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onBlur={handleSearchBlur}
                onFocus={handleSearchFocus}
                placeholder={isTrashView ? 'Trash' : 'Search text, speech, screenshots, tags...'}
                disabled={isTrashView}
                autoFocus
              />
              <button
                type="button"
                className="sd-search-clear"
                aria-label="Clear search"
                disabled={query.length === 0 || isTrashView}
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearSearch}
              >
                &times;
              </button>
            </form>
            <MediaFilterBar
              activeMediaTypes={activeMediaTypes}
              onToggleMediaType={toggleMediaTypeFilter}
              onClearFilters={clearMediaFilters}
            />
          </div>
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
          <FileDropzone
            className="sd-dropzone"
            uploading={uploading}
            onOpenFilePicker={openFilePicker}
            onAddFiles={addPendingFiles}
            title="Drop files here"
            subtitle="Images get OCR/captions, audio gets transcript, videos get audio transcription."
          />
        )}

        {error && <div className="sd-error">{error}</div>}

        <div className="sd-result-count">
          {isTrashView
            ? `${displayed.length} trashed file${displayed.length === 1 ? '' : 's'}`
            : query.trim()
              ? `${displayed.length} semantic result${displayed.length === 1 ? '' : 's'}`
              : `${displayed.length} file${displayed.length === 1 ? '' : 's'}`}
          {searching && <span> searching...</span>}
        </div>

        <AssetGrid
          items={displayed}
          isTrashView={isTrashView}
          restoringIds={restoringIds}
          purgingIds={purgingIds}
          trashingIds={trashingIds}
          retryingIds={retryingIds}
          onSelectAsset={setSelectedId}
          onCopyItem={copyItemToClipboard}
          onCreateShare={createShareSafely}
          onMoveToTrash={moveAssetToTrash}
          onRestoreAsset={restoreAsset}
          onPurgeAsset={purgeAsset}
          onRetryProcessing={retryProcessing}
        />
      </section>

      {detail && (
        <DetailDrawer
          detail={detail}
          drawerRef={detailDrawerRef}
          sharePayload={sharePayload}
          filenameDraft={filenameDraft}
          descriptionDraft={detailDescriptionDraft}
          tagsDraft={detailTagsDraft}
          isEditingFilename={isEditingFilename}
          detailHasChanges={detailHasChanges}
          savingFilename={savingFilename}
          savingDetail={savingDetail}
          deletingExtractions={deletingExtractions}
          trashingIds={trashingIds}
          retryingIds={retryingIds}
          onClose={closeDetailDrawer}
          onStartFilenameEdit={startFilenameEdit}
          onFilenameChange={setFilenameDraft}
          onSaveFilename={saveFilename}
          onCancelFilenameEdit={cancelFilenameEdit}
          onSaveMetadata={saveDetailMetadata}
          onDescriptionChange={setDetailDescriptionDraft}
          onTagsChange={setDetailTagsDraft}
          onCopyRawUrl={copyRawUrlSafely}
          onCreateShare={createShareSafely}
          onMoveToTrash={moveAssetToTrash}
          onRetryProcessing={retryProcessing}
          onDeleteExtraction={deleteExtraction}
        />
      )}

      {actionFeedback && <ActionToast feedback={actionFeedback} />}

      {uploadModalOpen && (
        <UploadModal
          uploading={uploading}
          pendingFiles={pendingFiles}
          uploadDescription={uploadDescription}
          uploadTags={uploadTags}
          onClose={closeUploadModal}
          onSubmit={submitUpload}
          onOpenFilePicker={openFilePicker}
          onAddFiles={addPendingFiles}
          onRemovePendingFile={removePendingFile}
          onDescriptionChange={setUploadDescription}
          onTagsChange={setUploadTags}
        />
      )}
    </main>
  );
}
