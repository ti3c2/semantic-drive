import type { Asset } from './types';

export const UPLOAD_CONCURRENCY_LIMIT = 5;
export const UPLOAD_MAX_ATTEMPTS = 3;
export const UPLOAD_RETRY_DELAY_MS = 350;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SleepLike = (ms: number) => Promise<void>;

export type UploadMetadata = {
  description: string;
  tagNames: string[];
};

export type UploadSuccess = {
  file: File;
  asset: Asset;
};

export type UploadFailure = {
  file: File;
  error: Error;
};

export type UploadBatchResult = {
  uploaded: UploadSuccess[];
  failed: UploadFailure[];
};

type UploadAssetOptions = {
  endpoint: string;
  fetchImpl?: FetchLike;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: SleepLike;
};

type UploadBatchOptions = UploadAssetOptions & {
  concurrency?: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function createUploadForm(file: File, metadata: UploadMetadata) {
  const form = new FormData();
  form.append('file', file);
  form.append('title', file.name);
  if (metadata.description) form.append('description', metadata.description);
  if (metadata.tagNames.length) form.append('tag_names', metadata.tagNames.join(','));
  return form;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));
}

function isRetryableUploadStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function normalizeError(error: unknown, fallback: string) {
  return error instanceof Error ? error : new Error(fallback);
}

class UploadHttpError extends Error {
  retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'UploadHttpError';
    this.retryable = retryable;
  }
}

async function errorMessageFromResponse(response: Response, file: File) {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  if (typeof payload?.detail === 'string') return payload.detail;
  return `Upload failed for ${file.name}`;
}

export async function uploadAssetFile(
  file: File,
  metadata: UploadMetadata,
  options: UploadAssetOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = normalizePositiveInteger(options.maxAttempts, UPLOAD_MAX_ATTEMPTS);
  const retryDelayMs = normalizePositiveInteger(options.retryDelayMs, UPLOAD_RETRY_DELAY_MS);
  const wait = options.sleep ?? sleep;
  let lastError = new Error(`Upload failed for ${file.name}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(options.endpoint, {
        method: 'POST',
        body: createUploadForm(file, metadata),
      });

      if (response.ok) return (await response.json()) as Asset;

      const message = await errorMessageFromResponse(response, file);
      const retryable = isRetryableUploadStatus(response.status);
      lastError = new UploadHttpError(message, retryable);
      if (!retryable || attempt === maxAttempts) {
        throw lastError;
      }
    } catch (error) {
      lastError = normalizeError(error, `Upload failed for ${file.name}`);
      if (error instanceof UploadHttpError && !error.retryable) throw lastError;
      if (attempt === maxAttempts) throw lastError;
    }

    await wait(retryDelayMs * 2 ** (attempt - 1));
  }

  throw lastError;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export async function runUploadQueue(
  files: File[],
  uploadFile: (file: File, index: number) => Promise<Asset>,
  concurrency = UPLOAD_CONCURRENCY_LIMIT,
): Promise<UploadBatchResult> {
  const limit = Math.min(
    normalizePositiveInteger(concurrency, UPLOAD_CONCURRENCY_LIMIT),
    files.length,
  );
  const uploaded: Array<UploadSuccess | undefined> = [];
  const failed: Array<UploadFailure | undefined> = [];
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const file = files[index];

      try {
        uploaded[index] = { file, asset: await uploadFile(file, index) };
      } catch (error) {
        failed[index] = {
          file,
          error: normalizeError(error, `Upload failed for ${file.name}`),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, runWorker));

  return {
    uploaded: uploaded.filter(isDefined),
    failed: failed.filter(isDefined),
  };
}

export function uploadAssetBatch(
  files: File[],
  metadata: UploadMetadata,
  options: UploadBatchOptions,
) {
  return runUploadQueue(
    files,
    (file) => uploadAssetFile(file, metadata, options),
    options.concurrency ?? UPLOAD_CONCURRENCY_LIMIT,
  );
}
