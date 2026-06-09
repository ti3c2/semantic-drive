import type { FormEvent, KeyboardEvent, RefObject } from 'react';
import type { AssetDetail, SharePayload } from './types';
import { api } from './api';
import { isMediaPreviewable } from './assetPreview';
import { Extraction } from './Extraction';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ShareIcon,
  TrashIcon,
  XIcon,
} from './icons';
import { IconOnlyAction, MediaTypeIcon } from './media';
import { InlineSpinner } from './StatusIndicator';
import { formatBytes } from './utils';

type DetailDrawerProps = {
  detail: AssetDetail;
  drawerRef: RefObject<HTMLElement | null>;
  sharePayload: SharePayload | null;
  filenameDraft: string;
  descriptionDraft: string;
  tagsDraft: string;
  isEditingFilename: boolean;
  detailHasChanges: boolean;
  savingFilename: boolean;
  savingDetail: boolean;
  deletingExtractions: ReadonlySet<string>;
  trashingIds: ReadonlySet<string>;
  retryingIds: ReadonlySet<string>;
  canCycleAssets: boolean;
  isPending: boolean;
  onClose: () => void;
  onOpenPreview: (assetId: string) => void;
  onPreviousAsset: () => void;
  onNextAsset: () => void;
  onStartFilenameEdit: () => void;
  onFilenameChange: (value: string) => void;
  onSaveFilename: () => void;
  onCancelFilenameEdit: () => void;
  onSaveMetadata: (event: FormEvent) => void;
  onCancelMetadataEdit: () => void;
  onDescriptionChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onCopyRawUrl: (path: string) => void;
  onCreateShare: (assetId: string) => void;
  onMoveToTrash: (assetId: string) => void;
  onRetryProcessing: (assetId: string) => void;
  onDeleteExtraction: (extractionType: string) => void;
};

export function DetailDrawer({
  detail,
  drawerRef,
  sharePayload,
  filenameDraft,
  descriptionDraft,
  tagsDraft,
  isEditingFilename,
  detailHasChanges,
  savingFilename,
  savingDetail,
  deletingExtractions,
  trashingIds,
  retryingIds,
  canCycleAssets,
  isPending,
  onClose,
  onOpenPreview,
  onPreviousAsset,
  onNextAsset,
  onStartFilenameEdit,
  onFilenameChange,
  onSaveFilename,
  onCancelFilenameEdit,
  onSaveMetadata,
  onCancelMetadataEdit,
  onDescriptionChange,
  onTagsChange,
  onCopyRawUrl,
  onCreateShare,
  onMoveToTrash,
  onRetryProcessing,
  onDeleteExtraction,
}: DetailDrawerProps) {
  function handleFilenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSaveFilename();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelFilenameEdit();
    }
  }

  const canOpenPreview = isMediaPreviewable(detail);
  const previewTitle = detail.display_title || detail.original_filename;

  return (
    <aside
      className={`sd-drawer${isPending ? ' sd-drawer-pending' : ''}`}
      ref={drawerRef}
      aria-busy={isPending ? 'true' : undefined}
    >
      <button type="button" className="sd-close" onClick={onClose}>
        &times;
      </button>
      {isEditingFilename ? (
        <div className="sd-filename-editor">
          <input
            value={filenameDraft}
            onChange={(event) => onFilenameChange(event.target.value)}
            onKeyDown={handleFilenameKeyDown}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Filename"
            disabled={savingFilename}
            autoFocus
          />
          <button
            type="button"
            className="sd-filename-save"
            aria-label={savingFilename ? 'Saving filename' : 'Save filename'}
            title={savingFilename ? 'Saving filename' : 'Save filename'}
            onClick={onSaveFilename}
            disabled={savingFilename || !filenameDraft.trim()}
          >
            {savingFilename ? <InlineSpinner /> : <CheckIcon />}
          </button>
          <button
            type="button"
            className="sd-filename-cancel"
            aria-label="Cancel filename edit"
            title="Cancel filename edit"
            onClick={onCancelFilenameEdit}
            disabled={savingFilename}
          >
            <XIcon />
          </button>
        </div>
      ) : (
        <h2 className="sd-filename-heading">
          <button
            type="button"
            className="sd-filename-title"
            onClick={onStartFilenameEdit}
            title="Edit filename"
          >
            {detail.original_filename}
          </button>
        </h2>
      )}
      <div className="sd-detail-meta">
        {detail.mime_type} &middot; {formatBytes(detail.file_size_bytes)} &middot;{' '}
        {detail.processing_status}
      </div>
      <div className={`sd-preview${canOpenPreview ? ' sd-preview-clickable' : ''}`}>
        {canOpenPreview ? (
          <button
            type="button"
            className="sd-preview-open"
            aria-label={`Open ${previewTitle} preview`}
            onClick={() => onOpenPreview(detail.id)}
          >
            {detail.media_type === 'image' && <img src={api(detail.raw_url)} alt={previewTitle} />}
            {detail.media_type === 'video' && (
              <video
                src={api(detail.raw_url)}
                poster={detail.thumbnail_url ? api(detail.thumbnail_url) : undefined}
                muted
                playsInline
                preload="metadata"
              />
            )}
            {detail.media_type === 'audio' && (
              <div className="sd-audio-preview" aria-hidden="true">
                <MediaTypeIcon mediaType={detail.media_type} size={42} />
              </div>
            )}
          </button>
        ) : (
          <>
            {detail.media_type === 'image' && <img src={api(detail.raw_url)} alt={previewTitle} />}
            {detail.media_type === 'video' && (
              <video
                src={api(detail.raw_url)}
                poster={detail.thumbnail_url ? api(detail.thumbnail_url) : undefined}
                controls
              />
            )}
            {detail.media_type === 'audio' && <audio src={api(detail.raw_url)} controls />}
          </>
        )}
      </div>
      <form className="sd-detail-edit" onSubmit={onSaveMetadata}>
        <label className="sd-field">
          <span>Description</span>
          <textarea
            value={descriptionDraft}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={5}
            placeholder="Add context, source, notes..."
          />
        </label>
        <label className="sd-field">
          <span>Tags</span>
          <input
            value={tagsDraft}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder="research, invoice, client-a"
          />
        </label>
        {detailHasChanges && (
          <div className="sd-detail-edit-actions">
            <button
              type="submit"
              className="sd-detail-save"
              aria-label={savingDetail ? 'Saving metadata' : 'Save metadata'}
              title={savingDetail ? 'Saving metadata' : 'Save metadata'}
              disabled={savingDetail}
            >
              {savingDetail ? <InlineSpinner /> : <CheckIcon />}
            </button>
            <button
              type="button"
              className="sd-detail-cancel"
              aria-label="Cancel metadata edit"
              title="Cancel metadata edit"
              onClick={onCancelMetadataEdit}
              disabled={savingDetail}
            >
              <XIcon />
            </button>
          </div>
        )}
      </form>
      <div className="sd-drawer-actions">
        <button
          type="button"
          aria-label="Copy raw URL"
          title="Copy raw URL"
          onClick={() => onCopyRawUrl(detail.raw_url)}
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
          type="button"
          aria-label="Copy share link"
          title="Copy share link"
          onClick={() => onCreateShare(detail.id)}
        >
          <IconOnlyAction label="Copy share link">
            <ShareIcon />
          </IconOnlyAction>
        </button>
        <button
          type="button"
          className="sd-danger-action"
          aria-label={trashingIds.has(detail.id) ? 'Moving to trash' : 'Move to trash'}
          title={trashingIds.has(detail.id) ? 'Moving to trash' : 'Move to trash'}
          onClick={() => onMoveToTrash(detail.id)}
          disabled={trashingIds.has(detail.id)}
        >
          <IconOnlyAction label={trashingIds.has(detail.id) ? 'Moving to trash' : 'Move to trash'}>
            <TrashIcon />
          </IconOnlyAction>
        </button>
        {detail.processing_status === 'failed' && (
          <button
            type="button"
            onClick={() => onRetryProcessing(detail.id)}
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
          <textarea readOnly value={String(sharePayload.embed?.iframe || '')} />
        </div>
      )}
      <Extraction
        title="Visual summary"
        text={detail.visual_summary}
        deleting={deletingExtractions.has('visual_summary')}
        onDelete={() => onDeleteExtraction('visual_summary')}
      />
      <Extraction
        title="OCR"
        text={detail.ocr_text}
        deleting={deletingExtractions.has('ocr')}
        onDelete={() => onDeleteExtraction('ocr')}
      />
      <Extraction
        title="Transcript"
        text={detail.transcript}
        deleting={deletingExtractions.has('transcript')}
        onDelete={() => onDeleteExtraction('transcript')}
      />
      {canCycleAssets && (
        <div className="sd-drawer-cycle" aria-label="Asset navigation">
          <div className="sd-drawer-cycle-controls">
            <button type="button" aria-label="Previous asset" onClick={onPreviousAsset}>
              <ChevronLeftIcon />
            </button>
            <button type="button" aria-label="Next asset" onClick={onNextAsset}>
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
