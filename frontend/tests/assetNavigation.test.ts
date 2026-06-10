import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assetToDisplay,
  getCycledAssetId,
  getDisplayItemsByMediaType,
  resultToDisplay,
} from '../src/components/semantic-drive/utils.ts';

const assets = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

test('getCycledAssetId moves forward through assets', () => {
  assert.equal(getCycledAssetId(assets, 'first', 1), 'second');
});

test('getCycledAssetId wraps forward from the last asset', () => {
  assert.equal(getCycledAssetId(assets, 'third', 1), 'first');
});

test('getCycledAssetId wraps backward from the first asset', () => {
  assert.equal(getCycledAssetId(assets, 'first', -1), 'third');
});

test('getCycledAssetId starts at the nearest edge when the current asset is missing', () => {
  assert.equal(getCycledAssetId(assets, 'missing', 1), 'first');
  assert.equal(getCycledAssetId(assets, 'missing', -1), 'third');
});

test('getCycledAssetId returns null without assets', () => {
  assert.equal(getCycledAssetId([], 'first', 1), null);
});

test('getDisplayItemsByMediaType keeps displayed audio order', () => {
  const displayed = [
    { id: 'image-one', media_type: 'image' },
    { id: 'audio-one', media_type: 'audio' },
    { id: 'video-one', media_type: 'video' },
    { id: 'audio-two', media_type: 'audio' },
  ];

  assert.deepEqual(
    getDisplayItemsByMediaType(displayed, 'audio').map((item) => item.id),
    ['audio-one', 'audio-two'],
  );
});

test('displayed audio order drives next and previous playback targets', () => {
  const displayedAudio = getDisplayItemsByMediaType(
    [
      { id: 'hidden-by-type-image', media_type: 'image' },
      { id: 'first-audio', media_type: 'audio' },
      { id: 'middle-video', media_type: 'video' },
      { id: 'second-audio', media_type: 'audio' },
    ],
    'audio',
  );

  assert.equal(getCycledAssetId(displayedAudio, 'first-audio', 1), 'second-audio');
  assert.equal(getCycledAssetId(displayedAudio, 'first-audio', -1), 'second-audio');
});

test('assetToDisplay carries duration metadata', () => {
  const item = assetToDisplay({
    id: 'audio-one',
    original_filename: 'audio-one.mp3',
    display_title: null,
    media_type: 'audio',
    mime_type: 'audio/mpeg',
    file_size_bytes: 100,
    duration_ms: 12345,
    width: null,
    height: null,
    processing_status: 'ready',
    visibility: 'private',
    thumbnail_url: null,
    raw_url: '/raw',
    download_url: '/download',
    tags: [],
    created_at: '2026-06-10T00:00:00Z',
  });

  assert.equal(item.duration_ms, 12345);
});

test('resultToDisplay carries search result duration metadata', () => {
  const item = resultToDisplay({
    asset_id: 'audio-search',
    title: 'Audio search',
    original_filename: 'audio-search.mp3',
    media_type: 'audio',
    mime_type: 'audio/mpeg',
    duration_ms: 98765,
    width: null,
    height: null,
    thumbnail_url: null,
    raw_url: '/raw',
    download_url: '/download',
    score: 0.9,
    vector_score: null,
    rerank_score: null,
    match_reason: { type: 'transcript', text: 'hello' },
    tags: [],
    created_at: '2026-06-10T00:00:00Z',
  });

  assert.equal(item.duration_ms, 98765);
});
