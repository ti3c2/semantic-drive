import type { DisplayItem } from './types';

type PreviewableAsset = Pick<DisplayItem, 'media_type' | 'thumbnail_url' | 'raw_url'>;

export function assetPreviewImageUrl(asset: PreviewableAsset) {
  if (asset.thumbnail_url) return asset.thumbnail_url;
  if (asset.media_type === 'image') return asset.raw_url;
  return null;
}
