import type { DisplayItem } from './types';

type PreviewableAsset = Pick<DisplayItem, 'media_type' | 'thumbnail_url' | 'raw_url'>;

type AssetPreviewImageOptions = {
  allowRawImageFallback?: boolean;
};

export function assetPreviewImageUrl(
  asset: PreviewableAsset,
  options: AssetPreviewImageOptions = {},
) {
  if (asset.thumbnail_url) return asset.thumbnail_url;
  if ((options.allowRawImageFallback ?? true) && asset.media_type === 'image') return asset.raw_url;
  return null;
}

export function isMediaPreviewable(asset: Pick<DisplayItem, 'media_type'>) {
  return (
    asset.media_type === 'image' || asset.media_type === 'video' || asset.media_type === 'audio'
  );
}
