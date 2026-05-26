import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countMatchingPersons,
  meetsPersonThreshold,
  trackCountsAsPerson,
} from '../src/presence/state.js';

const settings = {
  minPersonCount: 2,
  minScore: 0.35,
  useConfirmedOnly: false,
};

function track(id, score = 0.9) {
  return { id, missed: 0, confirmed: true, score };
}

test('meetsPersonThreshold requires enough qualifying tracks', () => {
  assert.equal(meetsPersonThreshold([track(1)], settings), false);
  assert.equal(meetsPersonThreshold([track(1), track(2)], settings), true);
});

test('countMatchingPersons ignores missed or low-score tracks', () => {
  const tracks = [track(1), { ...track(2), missed: 1 }, { ...track(3), score: 0.1 }];
  assert.equal(countMatchingPersons(tracks, settings), 1);
  assert.equal(trackCountsAsPerson(tracks[0], settings), true);
  assert.equal(trackCountsAsPerson(tracks[1], settings), false);
});
