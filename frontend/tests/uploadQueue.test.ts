import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  runUploadQueue,
  uploadAssetFile,
  UPLOAD_CONCURRENCY_LIMIT,
} from '../src/components/semantic-drive/uploadQueue.ts';

function makeFile(name: string) {
  return new File(['content'], name, { type: 'text/plain', lastModified: 1 });
}

function makeAsset(id: string) {
  return {
    id,
    original_filename: `${id}.txt`,
    display_title: id,
    description: null,
    media_type: 'text',
    mime_type: 'text/plain',
    file_size_bytes: 7,
    processing_status: 'queued',
    visibility: 'private',
    raw_url: `/api/assets/${id}/raw`,
    download_url: `/api/assets/${id}/download`,
    tags: [],
    created_at: '2026-06-09T00:00:00Z',
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('runUploadQueue caps concurrent uploads', async () => {
  const files = Array.from({ length: 12 }, (_, index) => makeFile(`file-${index}.txt`));
  let activeUploads = 0;
  let maxActiveUploads = 0;

  const result = await runUploadQueue(
    files,
    async (_file, index) => {
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeUploads -= 1;
      return makeAsset(`asset-${index}`);
    },
    UPLOAD_CONCURRENCY_LIMIT,
  );

  assert.equal(maxActiveUploads, UPLOAD_CONCURRENCY_LIMIT);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(
    result.uploaded.map(({ asset }) => asset.id),
    files.map((_file, index) => `asset-${index}`),
  );
});

test('uploadAssetFile retries retryable upload failures', async () => {
  const file = makeFile('retry-me.txt');
  const asset = makeAsset('retry-me');
  let attempts = 0;

  const result = await uploadAssetFile(
    file,
    { description: 'Project note', tagNames: ['research'] },
    {
      endpoint: '/api/assets',
      fetchImpl: async (input, init) => {
        attempts += 1;
        assert.equal(input, '/api/assets');
        assert.equal(init?.method, 'POST');
        assert.ok(init?.body instanceof FormData);
        if (attempts < 3) return jsonResponse({ detail: 'temporary upload failure' }, 503);
        return jsonResponse(asset, 201);
      },
      sleep: async () => undefined,
    },
  );

  assert.equal(attempts, 3);
  assert.equal(result.id, asset.id);
});

test('uploadAssetFile does not retry non-retryable upload failures', async () => {
  const file = makeFile('too-large.txt');
  let attempts = 0;

  await assert.rejects(
    () =>
      uploadAssetFile(
        file,
        { description: '', tagNames: [] },
        {
          endpoint: '/api/assets',
          fetchImpl: async () => {
            attempts += 1;
            return jsonResponse({ detail: 'Upload exceeds 100 MB' }, 413);
          },
          sleep: async () => undefined,
        },
      ),
    /Upload exceeds 100 MB/,
  );

  assert.equal(attempts, 1);
});
