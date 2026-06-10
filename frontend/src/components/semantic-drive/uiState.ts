import type { ViewMode } from './types';

export const SEMANTIC_DRIVE_UI_STATE_STORAGE_KEY = 'semantic-drive:ui-state:v1';

export type SemanticDriveUiState = {
  version: 1;
  isSidebarOpen: boolean;
  viewMode: ViewMode;
  selectedAssetId: string | null;
  previewAssetId: string | null;
  previewReturnToDrawer: boolean;
  openExtractionKeys: string[];
};

const DEFAULT_UI_STATE: SemanticDriveUiState = {
  version: 1,
  isSidebarOpen: false,
  viewMode: 'library',
  selectedAssetId: null,
  previewAssetId: null,
  previewReturnToDrawer: false,
  openExtractionKeys: [],
};

type UiStateReader = {
  getItem: (key: string) => string | null;
};

type UiStateWriter = {
  setItem: (key: string, value: string) => void;
};

export function createDefaultSemanticDriveUiState(): SemanticDriveUiState {
  return { ...DEFAULT_UI_STATE, openExtractionKeys: [] };
}

export function semanticDriveExtractionKey(assetId: string, extractionType: string) {
  return `${assetId}:${extractionType}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readViewMode(value: unknown): ViewMode {
  return value === 'trash' ? 'trash' : 'library';
}

function readStringOrNull(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOpenExtractionKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function normalizeSemanticDriveUiState(value: unknown): SemanticDriveUiState {
  if (!isRecord(value) || value.version !== 1) {
    return createDefaultSemanticDriveUiState();
  }

  const viewMode = readViewMode(value.viewMode);
  const selectedAssetId = viewMode === 'library' ? readStringOrNull(value.selectedAssetId) : null;
  const previewAssetId = viewMode === 'library' ? readStringOrNull(value.previewAssetId) : null;

  return {
    version: 1,
    isSidebarOpen:
      typeof value.isSidebarOpen === 'boolean'
        ? value.isSidebarOpen
        : DEFAULT_UI_STATE.isSidebarOpen,
    viewMode,
    selectedAssetId,
    previewAssetId,
    previewReturnToDrawer: Boolean(previewAssetId && value.previewReturnToDrawer === true),
    openExtractionKeys: readOpenExtractionKeys(value.openExtractionKeys),
  };
}

export function parseSemanticDriveUiState(raw: string | null): SemanticDriveUiState {
  if (!raw) return createDefaultSemanticDriveUiState();
  try {
    return normalizeSemanticDriveUiState(JSON.parse(raw));
  } catch {
    return createDefaultSemanticDriveUiState();
  }
}

export function stringifySemanticDriveUiState(state: SemanticDriveUiState) {
  return JSON.stringify(normalizeSemanticDriveUiState(state));
}

export function readSemanticDriveUiState(storage: UiStateReader | null | undefined) {
  if (!storage) return createDefaultSemanticDriveUiState();
  try {
    return parseSemanticDriveUiState(storage.getItem(SEMANTIC_DRIVE_UI_STATE_STORAGE_KEY));
  } catch {
    return createDefaultSemanticDriveUiState();
  }
}

export function writeSemanticDriveUiState(
  storage: UiStateWriter | null | undefined,
  state: SemanticDriveUiState,
) {
  if (!storage) return;
  try {
    storage.setItem(SEMANTIC_DRIVE_UI_STATE_STORAGE_KEY, stringifySemanticDriveUiState(state));
  } catch {
    // Private browsing and blocked storage should not break the app shell.
  }
}

function browserSessionStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStoredSemanticDriveUiState() {
  return readSemanticDriveUiState(browserSessionStorage());
}

export function writeStoredSemanticDriveUiState(state: SemanticDriveUiState) {
  writeSemanticDriveUiState(browserSessionStorage(), state);
}
