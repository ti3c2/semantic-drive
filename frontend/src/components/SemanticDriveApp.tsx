import type { FocusEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './SemanticDriveApp.css';
import { ActionToast } from './semantic-drive/ActionToast';
import { api } from './semantic-drive/api';
import { AssetGrid } from './semantic-drive/AssetGrid';
import { AudioPlayerBar } from './semantic-drive/AudioPlayerBar';
import { isMediaPreviewable } from './semantic-drive/assetPreview';
import { copyImageUrlToClipboard, copyTextToClipboard } from './semantic-drive/clipboard';
import { shouldCloseDetailDrawerForPointerTarget } from './semantic-drive/detailDrawerClickAway';
import { DetailDrawer } from './semantic-drive/DetailDrawer';
import { FileDropzone } from './semantic-drive/FileDropzone';
import { FullscreenPreview } from './semantic-drive/FullscreenPreview';
import {
  MEDIA_TYPE_FILTERS,
  MediaFilterBar,
  type MediaTypeFilter,
} from './semantic-drive/MediaFilterBar';
import type { PlaybackMode } from './semantic-drive/MediaPlayerControls';
import { isMediaShortcutControlTarget, isPlaybackToggleKey } from './semantic-drive/mediaPlayer';
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
import {
  readStoredSemanticDriveUiState,
  writeStoredSemanticDriveUiState,
} from './semantic-drive/uiState';
import { UploadModal } from './semantic-drive/UploadModal';
import { uploadAssetBatch } from './semantic-drive/uploadQueue';
import {
  assetToDisplay,
  fileKey,
  getCycledAssetId,
  getDisplayItemsByMediaType,
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

function isEditableKeyTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export default function SemanticDriveApp() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [trashAssets, setTrashAssets] = useState<Asset[]>([]);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(() => new Set());
  const [trashingIds, setTrashingIds] = useState<Set<string>>(() => new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(() => new Set());
  const [purgingIds, setPurgingIds] = useState<Set<string>>(() => new Set());
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewReturnToDrawer, setPreviewReturnToDrawer] = useState(false);
  const [audioPlayerAssetId, setAudioPlayerAssetId] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1);
  const [audioVolume, setAudioVolume] = useState(0.8);
  const [audioPlaybackMode, setAudioPlaybackMode] = useState<PlaybackMode>('advance');
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  const [uiStateRestored, setUiStateRestored] = useState(false);
  const [openExtractionKeys, setOpenExtractionKeys] = useState<Set<string>>(() => new Set());
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
    setAssetsLoaded(true);
  }, []);

  useEffect(() => {
    const restored = readStoredSemanticDriveUiState();
    setIsSidebarOpen(restored.isSidebarOpen);
    setViewMode(restored.viewMode);
    setOpenExtractionKeys(new Set(restored.openExtractionKeys));
    setSelectedId(restored.selectedAssetId);
    setPreviewAssetId(restored.previewAssetId);
    setPreviewReturnToDrawer(restored.previewReturnToDrawer);
    setUiStateRestored(true);
  }, []);

  useEffect(() => {
    if (!uiStateRestored) return;

    writeStoredSemanticDriveUiState({
      version: 1,
      isSidebarOpen,
      viewMode,
      selectedAssetId: viewMode === 'library' ? selectedId : null,
      previewAssetId: viewMode === 'library' ? previewAssetId : null,
      previewReturnToDrawer: viewMode === 'library' ? previewReturnToDrawer : false,
      openExtractionKeys: [...openExtractionKeys].sort(),
    });
  }, [
    isSidebarOpen,
    openExtractionKeys,
    previewAssetId,
    previewReturnToDrawer,
    selectedId,
    uiStateRestored,
    viewMode,
  ]);

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
    if (!detail || previewAssetId) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const drawer = detailDrawerRef.current;
      const target = event.target;
      if (!drawer || !(target instanceof Node)) return;
      const targetElement = target instanceof Element ? target : target.parentElement;
      if (!shouldCloseDetailDrawerForPointerTarget(targetElement, drawer.contains(target))) return;
      closeDetailDrawer();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
  }, [closeDetailDrawer, detail, previewAssetId]);

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
    if (detail?.id === selectedId) {
      return;
    }
    let cancelled = false;
    const previousDetailId = detail?.id ?? null;
    fetchAssetDetail(selectedId)
      .then((nextDetail) => {
        if (cancelled) return;
        setDetail(nextDetail);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        if (previousDetailId) {
          setSelectedId((current) => (current === selectedId ? previousDetailId : current));
        } else {
          setSelectedId((current) => (current === selectedId ? null : current));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detail?.id, fetchAssetDetail, selectedId]);

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

  const drawerItems = useMemo(() => {
    if (!detail || displayed.some((item) => item.id === detail.id)) return displayed;
    return [assetToDisplay(detail), ...displayed];
  }, [detail, displayed]);

  const displayedAudioItems = useMemo(
    () => (isTrashView ? [] : getDisplayItemsByMediaType(displayed, 'audio')),
    [displayed, isTrashView],
  );
  const displayedVideoItems = useMemo(
    () => (isTrashView ? [] : getDisplayItemsByMediaType(displayed, 'video')),
    [displayed, isTrashView],
  );
  const knownPlaybackItems = useMemo(() => {
    const seen = new Set<string>();
    const items = [
      ...(detail ? [assetToDisplay(detail)] : []),
      ...displayed,
      ...assets.map(assetToDisplay),
    ];
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [assets, detail, displayed]);

  const audioPlayerItem = useMemo(() => {
    if (!audioPlayerAssetId) return null;
    return (
      knownPlaybackItems.find(
        (item) => item.id === audioPlayerAssetId && item.media_type === 'audio',
      ) ?? null
    );
  }, [audioPlayerAssetId, knownPlaybackItems]);

  const previewItems = useMemo(
    () => drawerItems.filter((item) => item.media_type !== 'audio' && isMediaPreviewable(item)),
    [drawerItems],
  );

  const previewAsset = useMemo(() => {
    if (!previewAssetId) return null;
    return previewItems.find((item) => item.id === previewAssetId) ?? null;
  }, [previewAssetId, previewItems]);

  const previewCycleItems = useMemo(() => {
    if (!previewAsset) return [];
    if (previewAsset.media_type !== 'video') return previewItems;
    if (displayedVideoItems.some((item) => item.id === previewAsset.id)) return displayedVideoItems;
    return [previewAsset, ...displayedVideoItems];
  }, [displayedVideoItems, previewAsset, previewItems]);

  const canCycleDrawerAssets = drawerItems.length > 1;
  const canCyclePreviewAssets = previewCycleItems.length > 1;
  const canNavigateAudioAssets =
    displayedAudioItems.length > 1 ||
    Boolean(
      audioPlayerAssetId &&
      displayedAudioItems.length > 0 &&
      !displayedAudioItems.some((item) => item.id === audioPlayerAssetId),
    );
  const isDetailPending = Boolean(detail && selectedId && detail.id !== selectedId);

  const openFullscreenPreview = useCallback((assetId: string, returnToDrawer = false) => {
    setPreviewReturnToDrawer(returnToDrawer);
    setPreviewAssetId(assetId);
  }, []);

  const openAudioPlayer = useCallback((assetId: string) => {
    setAudioPlayerAssetId(assetId);
    setIsAudioPlaying(true);
  }, []);

  const toggleAudioPlayback = useCallback((assetId: string) => {
    setAudioPlayerAssetId((currentId) => {
      if (currentId === assetId) {
        setIsAudioPlaying((current) => !current);
        return currentId;
      }
      setIsAudioPlaying(true);
      return assetId;
    });
  }, []);

  const openMediaPreview = useCallback(
    (assetId: string, returnToDrawer = false) => {
      const item =
        drawerItems.find((candidate) => candidate.id === assetId) ??
        knownPlaybackItems.find((candidate) => candidate.id === assetId);
      if (item?.media_type === 'audio') {
        openAudioPlayer(assetId);
        return;
      }
      openFullscreenPreview(assetId, returnToDrawer);
    },
    [drawerItems, knownPlaybackItems, openAudioPlayer, openFullscreenPreview],
  );

  const closeFullscreenPreview = useCallback(() => {
    setPreviewAssetId((currentId) => {
      if (previewReturnToDrawer && currentId) {
        setSelectedId(currentId);
        setSharePayload(null);
        setIsEditingFilename(false);
      }
      return null;
    });
    setPreviewReturnToDrawer(false);
  }, [previewReturnToDrawer]);

  const cyclePreviewAsset = useCallback(
    (direction: -1 | 1) => {
      setPreviewAssetId((currentId) => getCycledAssetId(previewCycleItems, currentId, direction));
    },
    [previewCycleItems],
  );

  const cycleDetailAsset = useCallback(
    (direction: -1 | 1) => {
      const nextId = getCycledAssetId(drawerItems, selectedIdRef.current, direction);
      if (!nextId) return;
      setSelectedId(nextId);
      setSharePayload(null);
      setIsEditingFilename(false);
    },
    [drawerItems],
  );

  const cycleAudioAsset = useCallback(
    (direction: -1 | 1) => {
      setAudioPlayerAssetId((currentId) => {
        const nextId = getCycledAssetId(displayedAudioItems, currentId, direction);
        return nextId ?? currentId;
      });
      setIsAudioPlaying(true);
    },
    [displayedAudioItems],
  );

  const closeAudioPlayer = useCallback(() => {
    setIsAudioPlaying(false);
    setAudioPlayerAssetId(null);
  }, []);

  const openAudioDrawer = useCallback(() => {
    if (!audioPlayerAssetId) return;
    setViewMode('library');
    setSelectedId(audioPlayerAssetId);
    setSharePayload(null);
    setIsEditingFilename(false);
  }, [audioPlayerAssetId]);

  const handleAudioEnded = useCallback(() => {
    if (canNavigateAudioAssets) {
      cycleAudioAsset(1);
      return;
    }
    setIsAudioPlaying(false);
  }, [canNavigateAudioAssets, cycleAudioAsset]);

  const toggleExtractionOpen = useCallback((key: string) => {
    setOpenExtractionKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

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

  useEffect(() => {
    if (!previewAssetId || previewAsset || !assetsLoaded) return;
    setPreviewAssetId(null);
    setPreviewReturnToDrawer(false);
  }, [assetsLoaded, previewAsset, previewAssetId]);

  useEffect(() => {
    if (!audioPlayerAssetId || audioPlayerItem || !assetsLoaded) return;
    closeAudioPlayer();
  }, [assetsLoaded, audioPlayerAssetId, audioPlayerItem, closeAudioPlayer]);

  useEffect(() => {
    if (!audioPlayerItem || previewAsset) return;

    const handleAudioPlayerKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        !isPlaybackToggleKey(event) ||
        isMediaShortcutControlTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      setIsAudioPlaying((current) => !current);
    };

    document.addEventListener('keydown', handleAudioPlayerKeyDown);
    return () => document.removeEventListener('keydown', handleAudioPlayerKeyDown);
  }, [audioPlayerItem, previewAsset]);

  useEffect(() => {
    if (!previewAssetId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [previewAssetId]);

  useEffect(() => {
    if (!previewAsset) return;

    const handlePreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeFullscreenPreview();
        return;
      }
      if (!canCyclePreviewAssets) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cyclePreviewAsset(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        cyclePreviewAsset(1);
      }
    };

    document.addEventListener('keydown', handlePreviewKeyDown);
    return () => document.removeEventListener('keydown', handlePreviewKeyDown);
  }, [canCyclePreviewAssets, closeFullscreenPreview, cyclePreviewAsset, previewAsset]);

  useEffect(() => {
    if (!detail || previewAssetId || !canCycleDrawerAssets) return;

    const handleDrawerKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyTarget(event.target)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleDetailAsset(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleDetailAsset(1);
      }
    };

    document.addEventListener('keydown', handleDrawerKeyDown);
    return () => document.removeEventListener('keydown', handleDrawerKeyDown);
  }, [canCycleDrawerAssets, cycleDetailAsset, detail, previewAssetId]);

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
      const result = await uploadAssetBatch(
        files,
        { description, tagNames },
        { endpoint: api('/api/assets') },
      );

      if (result.uploaded.length) {
        const uploadedAssets = result.uploaded.map(({ asset }) => asset).reverse();
        const uploadedIds = new Set(uploadedAssets.map((asset) => asset.id));
        setAssets((current) => [
          ...uploadedAssets,
          ...current.filter((item) => !uploadedIds.has(item.id)),
        ]);
      }

      if (result.failed.length) {
        setPendingFiles(result.failed.map(({ file }) => file));
        const [firstFailure] = result.failed;
        const failedNames = result.failed.map(({ file }) => file.name).join(', ');
        const message =
          result.failed.length === 1
            ? firstFailure.error.message
            : `${result.failed.length} uploads failed: ${failedNames}`;
        setError(message);
        return;
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
    if (!detail || savingDetail || !detailHasChanges) return;
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

  function cancelMetadataEdit() {
    if (!detail || savingDetail) return;
    setDetailDescriptionDraft(detail.description ?? '');
    setDetailTagsDraft(detail.tags.map((tag) => tag.name).join(', '));
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
      setPreviewAssetId((current) => (current === assetId ? null : current));
      setPreviewReturnToDrawer((current) => (previewAssetId === assetId ? false : current));
      if (audioPlayerAssetId === assetId) {
        closeAudioPlayer();
      }
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

  async function emptyTrash() {
    if (emptyingTrash || trashAssets.length === 0) return;
    const trashIds = trashAssets.map((asset) => asset.id);
    const fileLabel = `${trashIds.length} file${trashIds.length === 1 ? '' : 's'}`;
    if (!window.confirm(`Delete ${fileLabel} forever?`)) return;

    setEmptyingTrash(true);
    setPurgingIds((current) => {
      const next = new Set(current);
      trashIds.forEach((assetId) => next.add(assetId));
      return next;
    });
    setError(null);
    try {
      const response = await fetch(api('/api/assets/trash'), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Could not empty trash');
      }
      setTrashAssets([]);
      showActionFeedback('Trash emptied');
    } catch (err) {
      reportActionError(err, 'Could not empty trash');
    } finally {
      setEmptyingTrash(false);
      setPurgingIds((current) => {
        const next = new Set(current);
        trashIds.forEach((assetId) => next.delete(assetId));
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
    setPreviewAssetId(null);
    setPreviewReturnToDrawer(false);
    closeAudioPlayer();
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
        {!isTrashView && (
          <header className="sd-header">
            <div className="sd-search-stack">
              <form onSubmit={runSearch} className="sd-search">
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onBlur={handleSearchBlur}
                  onFocus={handleSearchFocus}
                  placeholder="Search text, speech, screenshots, tags..."
                  autoFocus
                />
                <button
                  type="button"
                  className="sd-search-clear"
                  aria-label="Clear search"
                  disabled={query.length === 0}
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
        )}

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

        <div className="sd-result-toolbar">
          {isTrashView && (
            <button
              type="button"
              className="sd-empty-trash-button"
              onClick={emptyTrash}
              disabled={
                trashAssets.length === 0 ||
                emptyingTrash ||
                restoringIds.size > 0 ||
                purgingIds.size > 0
              }
            >
              {emptyingTrash ? 'Emptying...' : 'Empty trash'}
            </button>
          )}
          <div className="sd-result-count">
            {isTrashView
              ? `${displayed.length} trashed file${displayed.length === 1 ? '' : 's'}`
              : query.trim()
                ? `${displayed.length} semantic result${displayed.length === 1 ? '' : 's'}`
                : `${displayed.length} file${displayed.length === 1 ? '' : 's'}`}
            {searching && <span> searching...</span>}
          </div>
        </div>

        <AssetGrid
          items={displayed}
          isTrashView={isTrashView}
          selectedAssetId={selectedId}
          restoringIds={restoringIds}
          purgingIds={purgingIds}
          trashingIds={trashingIds}
          retryingIds={retryingIds}
          audioPlayerAssetId={audioPlayerAssetId}
          isAudioPlaying={isAudioPlaying}
          onSelectAsset={setSelectedId}
          onCopyItem={copyItemToClipboard}
          onCreateShare={createShareSafely}
          onMoveToTrash={moveAssetToTrash}
          onRestoreAsset={restoreAsset}
          onPurgeAsset={purgeAsset}
          onRetryProcessing={retryProcessing}
          onOpenPreview={(assetId) => openMediaPreview(assetId, false)}
          onToggleAudioPlayback={toggleAudioPlayback}
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
          openExtractionKeys={openExtractionKeys}
          trashingIds={trashingIds}
          retryingIds={retryingIds}
          audioPlayerAssetId={audioPlayerAssetId}
          isAudioPlaying={isAudioPlaying}
          canCycleAssets={canCycleDrawerAssets}
          isPending={isDetailPending}
          onClose={closeDetailDrawer}
          onOpenPreview={(assetId) => openMediaPreview(assetId, true)}
          onPreviousAsset={() => cycleDetailAsset(-1)}
          onNextAsset={() => cycleDetailAsset(1)}
          onStartFilenameEdit={startFilenameEdit}
          onFilenameChange={setFilenameDraft}
          onSaveFilename={saveFilename}
          onCancelFilenameEdit={cancelFilenameEdit}
          onSaveMetadata={saveDetailMetadata}
          onCancelMetadataEdit={cancelMetadataEdit}
          onDescriptionChange={setDetailDescriptionDraft}
          onTagsChange={setDetailTagsDraft}
          onToggleExtraction={toggleExtractionOpen}
          onCopyRawUrl={copyRawUrlSafely}
          onCreateShare={createShareSafely}
          onMoveToTrash={moveAssetToTrash}
          onRetryProcessing={retryProcessing}
          onDeleteExtraction={deleteExtraction}
          onToggleAudioPlayback={toggleAudioPlayback}
        />
      )}

      {previewAsset && (
        <FullscreenPreview
          item={previewAsset}
          canCycle={canCyclePreviewAssets}
          onClose={closeFullscreenPreview}
          onPrevious={() => cyclePreviewAsset(-1)}
          onNext={() => cyclePreviewAsset(1)}
        />
      )}

      {audioPlayerItem && (
        <AudioPlayerBar
          item={audioPlayerItem}
          isPlaying={isAudioPlaying}
          playbackRate={audioPlaybackRate}
          volume={audioVolume}
          playbackMode={audioPlaybackMode}
          canNavigate={canNavigateAudioAssets}
          onPlayingChange={setIsAudioPlaying}
          onPlaybackRateChange={setAudioPlaybackRate}
          onVolumeChange={setAudioVolume}
          onTogglePlaybackMode={() =>
            setAudioPlaybackMode((current) => (current === 'repeat' ? 'advance' : 'repeat'))
          }
          onPrevious={() => cycleAudioAsset(-1)}
          onNext={() => cycleAudioAsset(1)}
          onEnded={handleAudioEnded}
          onOpenDrawer={openAudioDrawer}
          onClose={closeAudioPlayer}
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
