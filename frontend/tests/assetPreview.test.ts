import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assetPreviewImageUrl,
  isMediaPreviewable,
} from '../src/components/semantic-drive/assetPreview.ts';

test('assetPreviewImageUrl prefers generated thumbnails', () => {
  assert.equal(
    assetPreviewImageUrl({
      media_type: 'image',
      thumbnail_url: '/api/assets/asset-id/thumbnail',
      raw_url: '/api/assets/asset-id/raw',
    }),
    '/api/assets/asset-id/thumbnail',
  );
});

test('assetPreviewImageUrl uses raw image while thumbnail is still processing', () => {
  assert.equal(
    assetPreviewImageUrl({
      media_type: 'image',
      thumbnail_url: null,
      raw_url: '/api/assets/asset-id/raw',
    }),
    '/api/assets/asset-id/raw',
  );
});

test('assetPreviewImageUrl can disable raw image fallback', () => {
  assert.equal(
    assetPreviewImageUrl(
      {
        media_type: 'image',
        thumbnail_url: null,
        raw_url: '/api/assets/asset-id/raw',
      },
      { allowRawImageFallback: false },
    ),
    null,
  );
});

test('assetPreviewImageUrl keeps non-image assets on placeholders until thumbnails exist', () => {
  assert.equal(
    assetPreviewImageUrl({
      media_type: 'audio',
      thumbnail_url: null,
      raw_url: '/api/assets/audio-id/raw',
    }),
    null,
  );
});

test('isMediaPreviewable accepts image, video, and audio assets', () => {
  assert.equal(isMediaPreviewable({ media_type: 'image' }), true);
  assert.equal(isMediaPreviewable({ media_type: 'video' }), true);
  assert.equal(isMediaPreviewable({ media_type: 'audio' }), true);
  assert.equal(isMediaPreviewable({ media_type: 'document' }), false);
});
