import type { DisplayItem } from './types';
import { api } from './api';
import { assetPreviewImageUrl, isMediaPreviewable } from './assetPreview';
import { CopyIcon, DownloadIcon, ExpandIcon, ShareIcon, TrashIcon } from './icons';
import { IconOnlyAction, MediaTypeIcon, mediaTypeLabel } from './media';
import { StatusIndicator } from './StatusIndicator';

type AssetGridProps = {
  items: DisplayItem[];
  isTrashView: boolean;
  selectedAssetId: string | null;
  restoringIds: ReadonlySet<string>;
  purgingIds: ReadonlySet<string>;
  trashingIds: ReadonlySet<string>;
  retryingIds: ReadonlySet<string>;
  onSelectAsset: (assetId: string) => void;
  onCopyItem: (item: DisplayItem) => void;
  onCreateShare: (assetId: string) => void;
  onMoveToTrash: (assetId: string) => void;
  onRestoreAsset: (assetId: string) => void;
  onPurgeAsset: (assetId: string) => void;
  onRetryProcessing: (assetId: string) => void;
  onOpenPreview: (assetId: string) => void;
};

export function AssetGrid({
  items,
  isTrashView,
  selectedAssetId,
  restoringIds,
  purgingIds,
  trashingIds,
  retryingIds,
  onSelectAsset,
  onCopyItem,
  onCreateShare,
  onMoveToTrash,
  onRestoreAsset,
  onPurgeAsset,
  onRetryProcessing,
  onOpenPreview,
}: AssetGridProps) {
  return (
    <section className="sd-grid">
      {items.map((item) => {
        const previewImageUrl = assetPreviewImageUrl(item);
        const canOpenPreview = !isTrashView && isMediaPreviewable(item);
        const isSelected = !isTrashView && item.id === selectedAssetId;
        return (
          <article
            key={item.id}
            className={`sd-card${isTrashView ? ' sd-card-muted' : ''}${isSelected ? ' sd-card-selected' : ''}`}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => {
              if (!isTrashView) onSelectAsset(item.id);
            }}
          >
            <div className={`sd-thumb${canOpenPreview ? ' sd-thumb-previewable' : ''}`}>
              {previewImageUrl ? (
                <img
                  src={api(previewImageUrl)}
                  alt={item.title}
                  loading={item.thumbnail_url ? 'lazy' : 'eager'}
                  decoding="async"
                />
              ) : (
                <div className="sd-placeholder" title={mediaTypeLabel(item.media_type)}>
                  <MediaTypeIcon mediaType={item.media_type} size={42} />
                  <span className="sd-sr-only">{mediaTypeLabel(item.media_type)}</span>
                </div>
              )}
              {canOpenPreview && (
                <button
                  type="button"
                  className="sd-thumb-expand"
                  aria-label={`Open ${item.title} preview`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenPreview(item.id);
                  }}
                >
                  <ExpandIcon size={18} />
                </button>
              )}
              <StatusIndicator status={item.status} />
            </div>
            <div className="sd-card-body">
              <div className="sd-card-title">
                <span className="sd-card-title-text">{item.title}</span>
                <span className="sd-card-title-media-icon" title={mediaTypeLabel(item.media_type)}>
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
                    type="button"
                    className="sd-restore-action"
                    onClick={() => onRestoreAsset(item.id)}
                    disabled={restoringIds.has(item.id)}
                  >
                    {restoringIds.has(item.id) ? 'Restoring...' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    className="sd-danger-action"
                    onClick={() => onPurgeAsset(item.id)}
                    disabled={purgingIds.has(item.id)}
                  >
                    {purgingIds.has(item.id) ? 'Deleting...' : 'Delete forever'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label="Copy"
                    title="Copy"
                    onClick={() => onCopyItem(item)}
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
                    type="button"
                    aria-label="Share"
                    title="Share"
                    onClick={() => onCreateShare(item.id)}
                  >
                    <IconOnlyAction label="Share">
                      <ShareIcon />
                    </IconOnlyAction>
                  </button>
                  <button
                    type="button"
                    className="sd-danger-action"
                    aria-label={trashingIds.has(item.id) ? 'Moving to trash' : 'Trash'}
                    title={trashingIds.has(item.id) ? 'Moving to trash' : 'Trash'}
                    onClick={() => onMoveToTrash(item.id)}
                    disabled={trashingIds.has(item.id)}
                  >
                    <IconOnlyAction label={trashingIds.has(item.id) ? 'Moving to trash' : 'Trash'}>
                      <TrashIcon />
                    </IconOnlyAction>
                  </button>
                </>
              )}
              {!isTrashView && item.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => onRetryProcessing(item.id)}
                  disabled={retryingIds.has(item.id)}
                >
                  {retryingIds.has(item.id) ? 'Retrying...' : 'Retry'}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
