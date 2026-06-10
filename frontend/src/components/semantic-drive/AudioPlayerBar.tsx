import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { MediaPlayerControls, type PlaybackMode } from './MediaPlayerControls';
import type { DisplayItem } from './types';

type AudioPlayerBarProps = {
  item: DisplayItem;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  playbackMode: PlaybackMode;
  canNavigate: boolean;
  onPlayingChange: (value: boolean) => void;
  onPlaybackRateChange: (value: number) => void;
  onVolumeChange: (value: number) => void;
  onTogglePlaybackMode: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onEnded: () => void;
  onOpenDrawer: () => void;
  onClose: () => void;
};

export function AudioPlayerBar({
  item,
  isPlaying,
  playbackRate,
  volume,
  playbackMode,
  canNavigate,
  onPlayingChange,
  onPlaybackRateChange,
  onVolumeChange,
  onTogglePlaybackMode,
  onPrevious,
  onNext,
  onEnded,
  onOpenDrawer,
  onClose,
}: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metadataDuration = item.duration_ms ? item.duration_ms / 1000 : 0;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(metadataDuration);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(metadataDuration);
  }, [item.id, metadataDuration]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, item.id]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume, item.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!isPlaying) {
      audio.pause();
      return;
    }
    audio.play().catch(() => onPlayingChange(false));
  }, [isPlaying, item.id, onPlayingChange]);

  function handleSeek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  function handleEnded() {
    const audio = audioRef.current;
    if (audio && playbackMode === 'repeat') {
      audio.currentTime = 0;
      setCurrentTime(0);
      audio.play().catch(() => onPlayingChange(false));
      return;
    }
    onEnded();
  }

  function updateDurationFromElement(element: HTMLAudioElement) {
    if (Number.isFinite(element.duration) && element.duration > 0) {
      setDuration(element.duration);
    }
  }

  return (
    <div className="sd-audio-player-bar" role="region" aria-label="Audio player">
      <audio
        key={item.id}
        ref={audioRef}
        src={api(item.raw_url)}
        preload="metadata"
        onLoadedMetadata={(event) => updateDurationFromElement(event.currentTarget)}
        onDurationChange={(event) => updateDurationFromElement(event.currentTarget)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        onEnded={handleEnded}
      />
      <MediaPlayerControls
        title={item.title || item.original_filename}
        isPlaying={isPlaying}
        playbackRate={playbackRate}
        volume={volume}
        playbackMode={playbackMode}
        currentTime={currentTime}
        duration={duration}
        canNavigate={canNavigate}
        onTogglePlay={() => onPlayingChange(!isPlaying)}
        onPrevious={onPrevious}
        onNext={onNext}
        onPlaybackRateChange={onPlaybackRateChange}
        onVolumeChange={onVolumeChange}
        onTogglePlaybackMode={onTogglePlaybackMode}
        onSeek={handleSeek}
        onOpenDrawer={onOpenDrawer}
        onClose={onClose}
      />
    </div>
  );
}
