import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from './icons';
import { isMediaShortcutControlTarget, isPlaybackToggleKey } from './mediaPlayer';
import { MediaPlayerControls, type PlaybackMode } from './MediaPlayerControls';
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
  const isVideo = item.media_type === 'video';
  const metadataDuration = item.duration_ms ? item.duration_ms / 1000 : 0;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(isVideo);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  const [videoVolume, setVideoVolume] = useState(0.8);
  const [videoPlaybackMode, setVideoPlaybackMode] = useState<PlaybackMode>('advance');
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(metadataDuration);

  useEffect(() => {
    setVideoCurrentTime(0);
    setVideoDuration(metadataDuration);
    setIsVideoPlaying(isVideo);
  }, [isVideo, item.id, metadataDuration]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = videoPlaybackRate;
    }
  }, [videoPlaybackRate, item.id]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = videoVolume;
    }
  }, [videoVolume, item.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    if (!isVideoPlaying) {
      video.pause();
      return;
    }
    video.play().catch(() => setIsVideoPlaying(false));
  }, [isVideo, isVideoPlaying, item.id]);

  useEffect(() => {
    if (!isVideo) return;

    const handleVideoKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        !isPlaybackToggleKey(event) ||
        isMediaShortcutControlTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      setIsVideoPlaying((current) => !current);
    };

    document.addEventListener('keydown', handleVideoKeyDown);
    return () => document.removeEventListener('keydown', handleVideoKeyDown);
  }, [isVideo]);

  function handleBackdropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, .sd-fullscreen-media, .sd-player-controls')) return;
    onClose();
  }

  function handleVideoSeek(value: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setVideoCurrentTime(value);
  }

  function handleVideoEnded() {
    const video = videoRef.current;
    if (video && videoPlaybackMode === 'repeat') {
      video.currentTime = 0;
      setVideoCurrentTime(0);
      video.play().catch(() => setIsVideoPlaying(false));
      return;
    }
    if (canCycle) {
      onNext();
      return;
    }
    setIsVideoPlaying(false);
  }

  function updateVideoDurationFromElement(element: HTMLVideoElement) {
    if (Number.isFinite(element.duration) && element.duration > 0) {
      setVideoDuration(element.duration);
    }
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
          <div className="sd-fullscreen-video-shell">
            <video
              key={item.id}
              ref={videoRef}
              className="sd-fullscreen-media"
              src={rawUrl}
              poster={posterUrl}
              playsInline
              preload="metadata"
              onClick={() => setIsVideoPlaying((current) => !current)}
              onLoadedMetadata={(event) => updateVideoDurationFromElement(event.currentTarget)}
              onDurationChange={(event) => updateVideoDurationFromElement(event.currentTarget)}
              onTimeUpdate={(event) => setVideoCurrentTime(event.currentTarget.currentTime || 0)}
              onEnded={handleVideoEnded}
            />
            <MediaPlayerControls
              className="sd-fullscreen-player-controls"
              title={title}
              isPlaying={isVideoPlaying}
              playbackRate={videoPlaybackRate}
              volume={videoVolume}
              playbackMode={videoPlaybackMode}
              currentTime={videoCurrentTime}
              duration={videoDuration}
              canNavigate={canCycle}
              onTogglePlay={() => setIsVideoPlaying((current) => !current)}
              onPrevious={onPrevious}
              onNext={onNext}
              onPlaybackRateChange={setVideoPlaybackRate}
              onVolumeChange={setVideoVolume}
              onTogglePlaybackMode={() =>
                setVideoPlaybackMode((current) => (current === 'repeat' ? 'advance' : 'repeat'))
              }
              onSeek={handleVideoSeek}
            />
          </div>
        )}
        <figcaption className="sd-fullscreen-caption">{title}</figcaption>
      </figure>
    </div>
  );
}
