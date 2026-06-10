import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCycledAssetId } from '../src/components/semantic-drive/utils.ts';

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
