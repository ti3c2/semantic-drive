import type { DisplayItem } from './types';

type PreviewableAsset = Pick<DisplayItem, 'media_type' | 'thumbnail_url' | 'raw_url'>;

export function assetPreviewImageUrl(asset: PreviewableAsset) {
  if (asset.thumbnail_url) return asset.thumbnail_url;
  if (asset.media_type === 'image') return asset.raw_url;
  return null;
}

export function isMediaPreviewable(asset: Pick<DisplayItem, 'media_type'>) {
  return (
    asset.media_type === 'image' || asset.media_type === 'video' || asset.media_type === 'audio'
  );
}
