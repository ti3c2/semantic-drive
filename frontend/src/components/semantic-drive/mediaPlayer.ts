export type MediaProgress = {
  currentTime: number;
  duration: number;
  seekMax: number;
  canSeek: boolean;
};

export function mediaProgress(currentTime: number, duration: number): MediaProgress {
  const finiteCurrentTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
  const finiteDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return {
    currentTime: finiteDuration
      ? Math.min(Math.max(finiteCurrentTime, 0), finiteDuration)
      : finiteCurrentTime,
    duration: finiteDuration,
    seekMax: finiteDuration || Math.max(finiteCurrentTime, 1),
    canSeek: finiteDuration > 0,
  };
}

export function isPlaybackToggleKey(event: Pick<KeyboardEvent, 'code' | 'key'>) {
  return event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
}

export function isMediaShortcutControlTarget(target: EventTarget | null) {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"]'),
  );
}
