import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALERT_MODE_CUSTOM,
  ALERT_MODE_STANDARD,
  ALERT_PRESETS,
  DEFAULTS,
  normalizeSettings,
} from '../src/presence/settings.js';

test('defaults use the standard preset', () => {
  assert.equal(DEFAULTS.alertMode, ALERT_MODE_STANDARD);
  assert.equal(DEFAULTS.consecutiveFrames, ALERT_PRESETS.standard.consecutiveFrames);
  assert.equal(DEFAULTS.faceWindowMs, ALERT_PRESETS.standard.faceWindowMs);
  assert.equal(DEFAULTS.faceHits, ALERT_PRESETS.standard.faceHits);
  assert.equal(DEFAULTS.repeatIntervalSec, ALERT_PRESETS.standard.repeatIntervalSec);
});

test('normalizes known preset mode values to that preset', () => {
  const quiet = normalizeSettings({ alertMode: 'quiet' });
  assert.equal(quiet.alertMode, 'quiet');
  assert.equal(quiet.consecutiveFrames, ALERT_PRESETS.quiet.consecutiveFrames);
  assert.equal(quiet.minScore, ALERT_PRESETS.quiet.minScore);
  assert.equal(quiet.faceWindowMs, ALERT_PRESETS.quiet.faceWindowMs);
  assert.equal(quiet.faceHits, ALERT_PRESETS.quiet.faceHits);
  assert.equal(quiet.leaveFrames, ALERT_PRESETS.quiet.leaveFrames);
  assert.equal(quiet.repeatIntervalSec, ALERT_PRESETS.quiet.repeatIntervalSec);
});

test('advanced values switch the mode to custom', () => {
  const custom = normalizeSettings({
    alertMode: 'standard',
    consecutiveFrames: 7,
    faceWindowMs: 2500,
    faceHits: 3,
  });

  assert.equal(custom.alertMode, ALERT_MODE_CUSTOM);
  assert.equal(custom.consecutiveFrames, 7);
  assert.equal(custom.faceWindowMs, 2500);
  assert.equal(custom.faceHits, 3);
});

test('confirmed-only filtering makes preset settings custom', () => {
  const custom = normalizeSettings({
    alertMode: 'standard',
    useConfirmedOnly: true,
  });

  assert.equal(custom.alertMode, ALERT_MODE_CUSTOM);
  assert.equal(custom.useConfirmedOnly, true);
});

test('clamps face thresholds to usable ranges', () => {
  const normalized = normalizeSettings({
    alertMode: 'custom',
    faceWindowMs: 10,
    faceHits: 99,
  });

  assert.equal(normalized.alertMode, ALERT_MODE_CUSTOM);
  assert.equal(normalized.faceWindowMs, 250);
  assert.equal(normalized.faceHits, 20);
});

test('custom mode preserves an explicitly empty leave-frame setting', () => {
  const normalized = normalizeSettings({
    alertMode: 'custom',
    consecutiveFrames: 9,
    leaveFrames: null,
  });

  assert.equal(normalized.alertMode, ALERT_MODE_CUSTOM);
  assert.equal(normalized.consecutiveFrames, 9);
  assert.equal(normalized.leaveFrames, null);
});
