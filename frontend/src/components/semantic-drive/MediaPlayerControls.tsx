import {
  ExpandIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  XIcon,
} from './icons';
import { mediaProgress } from './mediaPlayer';

export type PlaybackMode = 'advance' | 'repeat';

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

type MediaPlayerControlsProps = {
  title: string;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  playbackMode: PlaybackMode;
  currentTime: number;
  duration: number;
  canNavigate: boolean;
  className?: string;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPlaybackRateChange: (value: number) => void;
  onVolumeChange: (value: number) => void;
  onTogglePlaybackMode: () => void;
  onSeek: (value: number) => void;
  onOpenDrawer?: () => void;
  onClose?: () => void;
};

export function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function MediaPlayerControls({
  title,
  isPlaying,
  playbackRate,
  volume,
  playbackMode,
  currentTime,
  duration,
  canNavigate,
  className,
  onTogglePlay,
  onPrevious,
  onNext,
  onPlaybackRateChange,
  onVolumeChange,
  onTogglePlaybackMode,
  onSeek,
  onOpenDrawer,
  onClose,
}: MediaPlayerControlsProps) {
  const progress = mediaProgress(currentTime, duration);
  const modeLabel = playbackMode === 'repeat' ? 'Repeat current' : 'Play next';
  const handleSeek = (value: string) => onSeek(Number(value));

  return (
    <div className={`sd-player-controls${className ? ` ${className}` : ''}`}>
      <div className="sd-player-track">
        <div className="sd-player-title" title={title}>
          {title}
        </div>
        <div className="sd-player-progress-row">
          <span className="sd-player-time">{formatMediaTime(progress.currentTime)}</span>
          <input
            type="range"
            className="sd-player-seek"
            min="0"
            max={progress.seekMax}
            step="0.01"
            value={progress.currentTime}
            aria-label="Seek"
            disabled={!progress.canSeek}
            onInput={(event) => handleSeek(event.currentTarget.value)}
            onChange={(event) => handleSeek(event.currentTarget.value)}
          />
          <span className="sd-player-time">{formatMediaTime(progress.duration)}</span>
        </div>
      </div>

      <div className="sd-player-command-row">
        <button
          type="button"
          className="sd-player-icon-button"
          aria-label="Previous"
          title="Previous"
          onClick={onPrevious}
          disabled={!canNavigate}
        >
          <SkipBackIcon />
        </button>
        <button
          type="button"
          className="sd-player-icon-button sd-player-primary-button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
          onClick={onTogglePlay}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className="sd-player-icon-button"
          aria-label="Next"
          title="Next"
          onClick={onNext}
          disabled={!canNavigate}
        >
          <SkipForwardIcon />
        </button>
        <select
          className="sd-player-speed"
          aria-label="Playback speed"
          title="Playback speed"
          value={String(playbackRate)}
          onChange={(event) => onPlaybackRateChange(Number(event.currentTarget.value))}
        >
          {PLAYBACK_SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}x
            </option>
          ))}
        </select>
        <label className="sd-player-volume" title="Volume">
          <span className="sd-sr-only">Volume</span>
          <VolumeIcon />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            aria-label="Volume"
            onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
          />
        </label>
        <button
          type="button"
          className={`sd-player-icon-button${playbackMode === 'repeat' ? ' active' : ''}`}
          aria-label={modeLabel}
          title={modeLabel}
          onClick={onTogglePlaybackMode}
        >
          {playbackMode === 'repeat' ? <RepeatIcon /> : <SkipForwardIcon />}
        </button>
        {onOpenDrawer && (
          <button
            type="button"
            className="sd-player-icon-button"
            aria-label="Open drawer"
            title="Open drawer"
            onClick={onOpenDrawer}
          >
            <ExpandIcon />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            className="sd-player-icon-button"
            aria-label="Close player"
            title="Close player"
            onClick={onClose}
          >
            <XIcon />
          </button>
        )}
      </div>
    </div>
  );
}
