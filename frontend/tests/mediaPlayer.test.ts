import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isPlaybackToggleKey,
  mediaProgress,
} from '../src/components/semantic-drive/mediaPlayer.ts';

test('mediaProgress keeps current audio time when duration is not ready', () => {
  assert.deepEqual(mediaProgress(42.4, Number.NaN), {
    currentTime: 42.4,
    duration: 0,
    seekMax: 42.4,
    canSeek: false,
  });
});

test('mediaProgress clamps current time to known duration', () => {
  assert.deepEqual(mediaProgress(140, 120), {
    currentTime: 120,
    duration: 120,
    seekMax: 120,
    canSeek: true,
  });
});

test('isPlaybackToggleKey accepts Space keyboard events', () => {
  assert.equal(isPlaybackToggleKey({ code: 'Space', key: '' }), true);
  assert.equal(isPlaybackToggleKey({ code: '', key: ' ' }), true);
  assert.equal(isPlaybackToggleKey({ code: '', key: 'Spacebar' }), true);
});

test('isPlaybackToggleKey ignores unrelated keyboard events', () => {
  assert.equal(isPlaybackToggleKey({ code: 'Enter', key: 'Enter' }), false);
  assert.equal(isPlaybackToggleKey({ code: 'ArrowRight', key: 'ArrowRight' }), false);
});
