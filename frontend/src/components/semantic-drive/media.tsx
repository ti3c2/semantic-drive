import type { ReactNode } from 'react';
import { AudioIcon, ImageIcon, VideoIcon } from './icons';

export function mediaTypeLabel(mediaType: string) {
  if (mediaType === 'image') return 'Image';
  if (mediaType === 'video') return 'Video';
  if (mediaType === 'audio') return 'Audio';
  return mediaType || 'File';
}

export function MediaTypeIcon({ mediaType, size = 18 }: { mediaType: string; size?: number }) {
  if (mediaType === 'image') return <ImageIcon size={size} />;
  if (mediaType === 'video') return <VideoIcon size={size} />;
  if (mediaType === 'audio') return <AudioIcon size={size} />;
  return <span className="sd-media-fallback">{mediaTypeLabel(mediaType)}</span>;
}

export function IconOnlyAction({ children, label }: { children: ReactNode; label: string }) {
  return (
    <>
      <span className="sd-action-icon" aria-hidden="true">
        {children}
      </span>
      <span className="sd-sr-only">{label}</span>
    </>
  );
}
