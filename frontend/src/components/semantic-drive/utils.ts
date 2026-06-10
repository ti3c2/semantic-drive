import type { Asset, DisplayItem, SearchResult } from './types';

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function isLiveStatus(status?: string | null) {
  return Boolean(status && status !== 'ready' && status !== 'failed');
}

export function assetToDisplay(asset: Asset): DisplayItem {
  return {
    id: asset.id,
    title: asset.display_title || asset.original_filename,
    original_filename: asset.original_filename,
    media_type: asset.media_type,
    mime_type: asset.mime_type,
    duration_ms: asset.duration_ms,
    width: asset.width,
    height: asset.height,
    thumbnail_url: asset.thumbnail_url,
    raw_url: asset.raw_url,
    download_url: asset.download_url,
    status: asset.processing_status,
    tags: asset.tags.map((tag) => tag.name),
    created_at: asset.created_at,
  };
}

export function resultToDisplay(result: SearchResult): DisplayItem {
  return {
    id: result.asset_id,
    title: result.title,
    original_filename: result.original_filename,
    media_type: result.media_type,
    mime_type: result.mime_type,
    duration_ms: result.duration_ms,
    width: result.width,
    height: result.height,
    thumbnail_url: result.thumbnail_url,
    raw_url: result.raw_url,
    download_url: result.download_url,
    score: result.score,
    match: result.match_reason,
    tags: result.tags,
    created_at: result.created_at,
  };
}

export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function parseTagNames(raw: string) {
  const seen = new Set<string>();
  return raw
    .split(/[,\n]/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getCycledAssetId<T extends { id: string }>(
  items: T[],
  currentId: string | null,
  direction: -1 | 1,
) {
  if (!items.length) return null;

  const currentIndex = currentId ? items.findIndex((item) => item.id === currentId) : -1;
  const startingIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
  const nextIndex = (startingIndex + direction + items.length) % items.length;
  return items[nextIndex]?.id ?? null;
}

export function getDisplayItemsByMediaType<T extends { media_type: string }>(
  items: T[],
  mediaType: string,
) {
  return items.filter((item) => item.media_type === mediaType);
}

export function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
}
