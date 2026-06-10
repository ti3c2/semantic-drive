import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldCloseDetailDrawerForPointerTarget } from '../src/components/semantic-drive/detailDrawerClickAway.ts';

function targetWithClosestMatch(match: string | null) {
  return {
    closest(selector: string) {
      return match && selector.includes(match) ? { className: match } : null;
    },
  };
}

test('drawer click-away ignores clicks inside the drawer', () => {
  assert.equal(shouldCloseDetailDrawerForPointerTarget(targetWithClosestMatch(null), true), false);
});

test('drawer click-away ignores asset cards', () => {
  assert.equal(
    shouldCloseDetailDrawerForPointerTarget(targetWithClosestMatch('.sd-card'), false),
    false,
  );
});

test('drawer click-away ignores sidebar open button', () => {
  assert.equal(
    shouldCloseDetailDrawerForPointerTarget(
      targetWithClosestMatch('.sd-sidebar-open-button'),
      false,
    ),
    false,
  );
});

test('drawer click-away ignores sidebar controls', () => {
  assert.equal(
    shouldCloseDetailDrawerForPointerTarget(targetWithClosestMatch('.sd-sidebar'), false),
    false,
  );
});

test('drawer click-away ignores audio player controls', () => {
  assert.equal(
    shouldCloseDetailDrawerForPointerTarget(targetWithClosestMatch('.sd-audio-player-bar'), false),
    false,
  );
});

test('drawer click-away closes on ordinary page clicks', () => {
  assert.equal(shouldCloseDetailDrawerForPointerTarget(targetWithClosestMatch(null), false), true);
});
