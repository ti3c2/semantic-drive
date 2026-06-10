import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDefaultSemanticDriveUiState,
  normalizeSemanticDriveUiState,
  parseSemanticDriveUiState,
  semanticDriveExtractionKey,
  stringifySemanticDriveUiState,
} from '../src/components/semantic-drive/uiState.ts';

test('parseSemanticDriveUiState falls back for empty or invalid values', () => {
  assert.deepEqual(parseSemanticDriveUiState(null), createDefaultSemanticDriveUiState());
  assert.deepEqual(parseSemanticDriveUiState('{'), createDefaultSemanticDriveUiState());
});

test('normalizeSemanticDriveUiState restores valid open UI state', () => {
  assert.deepEqual(
    normalizeSemanticDriveUiState({
      version: 1,
      isSidebarOpen: true,
      viewMode: 'library',
      selectedAssetId: 'asset-1',
      previewAssetId: 'asset-2',
      previewReturnToDrawer: true,
      openExtractionKeys: ['asset-1:ocr', '', 42],
    }),
    {
      version: 1,
      isSidebarOpen: true,
      viewMode: 'library',
      selectedAssetId: 'asset-1',
      previewAssetId: 'asset-2',
      previewReturnToDrawer: true,
      openExtractionKeys: ['asset-1:ocr'],
    },
  );
});

test('normalizeSemanticDriveUiState drops asset-specific state outside library view', () => {
  assert.deepEqual(
    normalizeSemanticDriveUiState({
      version: 1,
      isSidebarOpen: true,
      viewMode: 'trash',
      selectedAssetId: 'asset-1',
      previewAssetId: 'asset-2',
      previewReturnToDrawer: true,
      openExtractionKeys: ['asset-1:ocr'],
    }),
    {
      version: 1,
      isSidebarOpen: true,
      viewMode: 'trash',
      selectedAssetId: null,
      previewAssetId: null,
      previewReturnToDrawer: false,
      openExtractionKeys: ['asset-1:ocr'],
    },
  );
});

test('stringifySemanticDriveUiState serializes normalized state', () => {
  assert.equal(
    stringifySemanticDriveUiState({
      version: 1,
      isSidebarOpen: true,
      viewMode: 'library',
      selectedAssetId: '',
      previewAssetId: 'asset-2',
      previewReturnToDrawer: true,
      openExtractionKeys: ['asset-2:transcript'],
    }),
    JSON.stringify({
      version: 1,
      isSidebarOpen: true,
      viewMode: 'library',
      selectedAssetId: null,
      previewAssetId: 'asset-2',
      previewReturnToDrawer: true,
      openExtractionKeys: ['asset-2:transcript'],
    }),
  );
});

test('semanticDriveExtractionKey scopes open sections to an asset', () => {
  assert.equal(semanticDriveExtractionKey('asset-1', 'ocr'), 'asset-1:ocr');
});
