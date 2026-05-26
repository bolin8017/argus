import test from 'node:test';
import assert from 'node:assert/strict';

import { FacePresenceState } from '../src/presence/face-state.js';

const settings = {
  faceWindowMs: 2000,
  faceHits: 2,
};

test('requires enough fresh face hits within the window', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);

  assert.equal(
    state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1000).present,
    false,
  );
  assert.equal(
    state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1600).present,
    true,
  );
});

test('ignores cached face boxes', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);

  state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1000);
  const result = state.tick([{ trackId: 7, fresh: false }], qualifying, settings, 1300);

  assert.equal(result.present, false);
});

test('reports recent fresh samples before the face threshold is met', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);

  state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1000);

  assert.equal(state.hasRecentSamples(qualifying, settings, 1300), true);
  assert.equal(state.hasRecentSamples(qualifying, settings, 4001), false);
});

test('counts at most one fresh sample per track per tick', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);

  const first = state.tick(
    [
      { trackId: 7, fresh: true },
      { trackId: 7, fresh: true },
    ],
    qualifying,
    settings,
    1000,
  );
  const second = state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1600);

  assert.equal(first.present, false);
  assert.equal(second.present, true);
});

test('expires old hits', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);

  state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1000);
  const result = state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 4001);

  assert.equal(result.present, false);
});

test('ignores faces for non-qualifying person tracks', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);

  state.tick([{ trackId: 8, fresh: true }], qualifying, settings, 1000);
  const result = state.tick([{ trackId: 8, fresh: true }], qualifying, settings, 1200);

  assert.equal(result.present, false);
});

test('reset clears stored samples', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);

  state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1000);
  state.reset();
  const result = state.tick([{ trackId: 7, fresh: true }], qualifying, settings, 1200);

  assert.equal(result.present, false);
});

test('does not qualify face alerts until the person count threshold is met', () => {
  const state = new FacePresenceState();
  const qualifying = new Set([7]);
  const faces = [{ trackId: 7, fresh: true }];

  state.tick(faces, qualifying, settings, 1000, false);
  const belowThreshold = state.tick(faces, qualifying, settings, 1600, false);
  assert.equal(belowThreshold.present, false);
  assert.equal(state.hasRecentSamples(qualifying, settings, 1600, false), false);

  assert.equal(state.tick(faces, qualifying, settings, 2000, true).present, false);
  assert.equal(state.tick(faces, qualifying, settings, 2600, true).present, true);
});
