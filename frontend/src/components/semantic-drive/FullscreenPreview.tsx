import type { PointerEvent as ReactPointerEvent } from 'react';
import { api } from './api';
import { AudioIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from './icons';
import type { DisplayItem } from './types';

type FullscreenPreviewProps = {
  item: DisplayItem;
  canCycle: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

export function FullscreenPreview({
  item,
  canCycle,
  onClose,
  onPrevious,
  onNext,
}: FullscreenPreviewProps) {
  const title = item.title || item.original_filename;
  const rawUrl = api(item.raw_url);
  const posterUrl = item.thumbnail_url ? api(item.thumbnail_url) : undefined;

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, .sd-fullscreen-media')) return;
    onClose();
  }

  return (
    <div
      className="sd-fullscreen-preview"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${title}`}
      onPointerDown={handleBackdropPointerDown}
    >
      <button
        type="button"
        className="sd-fullscreen-close"
        aria-label="Close preview"
        onClick={onClose}
      >
        <XIcon size={22} />
      </button>

      {canCycle && (
        <>
          <button
            type="button"
            className="sd-fullscreen-arrow sd-fullscreen-arrow-left"
            aria-label="Previous asset"
            onClick={onPrevious}
          >
            <ChevronLeftIcon size={58} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="sd-fullscreen-arrow sd-fullscreen-arrow-right"
            aria-label="Next asset"
            onClick={onNext}
          >
            <ChevronRightIcon size={58} strokeWidth={1.8} />
          </button>
        </>
      )}

      <figure className={`sd-fullscreen-stage sd-fullscreen-stage-${item.media_type}`}>
        {item.media_type === 'image' && (
          <img className="sd-fullscreen-media" src={rawUrl} alt={title} />
        )}
        {item.media_type === 'video' && (
          <video className="sd-fullscreen-media" src={rawUrl} poster={posterUrl} controls />
        )}
        {item.media_type === 'audio' && (
          <div className="sd-fullscreen-media sd-fullscreen-audio-card">
            <AudioIcon size={58} />
            <audio src={rawUrl} controls />
          </div>
        )}
        <figcaption className="sd-fullscreen-caption">{title}</figcaption>
      </figure>
    </div>
  );
}
