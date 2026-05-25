import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALERT_FACE,
  ALERT_NONE,
  ALERT_PERSON,
  ALERT_LABELS,
  AlertLevelState,
  shouldSuppressPersonAlert,
} from '../src/presence/alert-level.js';

test('labels match approved UI copy', () => {
  assert.equal(ALERT_LABELS[ALERT_NONE], '無人');
  assert.equal(ALERT_LABELS[ALERT_PERSON], '有人');
  assert.equal(ALERT_LABELS[ALERT_FACE], '偵測到臉');
});

test('fires when entering an alert state from none', () => {
  const state = new AlertLevelState();
  const result = state.tick(ALERT_PERSON, { repeatIntervalSec: 10 }, 1000);

  assert.equal(result.fire, true);
  assert.equal(result.level, ALERT_PERSON);
  assert.equal(result.label, '有人');
});

test('fires when upgrading to face but not when downgrading', () => {
  const state = new AlertLevelState();

  state.tick(ALERT_PERSON, { repeatIntervalSec: 10 }, 1000);
  const upgrade = state.tick(ALERT_FACE, { repeatIntervalSec: 10 }, 1500);
  const downgrade = state.tick(ALERT_PERSON, { repeatIntervalSec: 10 }, 1800);

  assert.equal(upgrade.fire, true);
  assert.equal(upgrade.label, '偵測到臉');
  assert.equal(downgrade.fire, false);
});

test('downgrades do not fire even when repeat interval has elapsed', () => {
  const state = new AlertLevelState();

  state.tick(ALERT_FACE, { repeatIntervalSec: 5 }, 1000);
  const downgrade = state.tick(ALERT_PERSON, { repeatIntervalSec: 5 }, 7000);
  const nextTick = state.tick(ALERT_PERSON, { repeatIntervalSec: 5 }, 7001);
  const laterRepeat = state.tick(ALERT_PERSON, { repeatIntervalSec: 5 }, 12_000);

  assert.equal(downgrade.fire, false);
  assert.equal(nextTick.fire, false);
  assert.equal(laterRepeat.fire, true);
});

test('repeats while staying in the same alert state after interval', () => {
  const state = new AlertLevelState();

  state.tick(ALERT_FACE, { repeatIntervalSec: 5 }, 1000);
  assert.equal(state.tick(ALERT_FACE, { repeatIntervalSec: 5 }, 5500).fire, false);
  assert.equal(state.tick(ALERT_FACE, { repeatIntervalSec: 5 }, 6000).fire, true);
});

test('does not repeat when repeat interval is zero', () => {
  const state = new AlertLevelState();

  state.tick(ALERT_PERSON, { repeatIntervalSec: 0 }, 1000);
  assert.equal(state.tick(ALERT_PERSON, { repeatIntervalSec: 0 }, 60_000).fire, false);
});

test('suppresses initial person alert while face evidence may still qualify', () => {
  assert.equal(shouldSuppressPersonAlert(ALERT_NONE, ALERT_PERSON, true), true);
  assert.equal(shouldSuppressPersonAlert(ALERT_NONE, ALERT_PERSON, false), false);
  assert.equal(shouldSuppressPersonAlert(ALERT_PERSON, ALERT_PERSON, true), false);
  assert.equal(shouldSuppressPersonAlert(ALERT_NONE, ALERT_FACE, true), false);
});

test('reset returns to none', () => {
  const state = new AlertLevelState();

  state.tick(ALERT_FACE, { repeatIntervalSec: 10 }, 1000);
  state.reset();

  assert.equal(state.level, ALERT_NONE);
  assert.equal(state.tick(ALERT_FACE, { repeatIntervalSec: 10 }, 1200).fire, true);
});
