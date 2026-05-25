# Graded Presence Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three-level lightweight alerts: `無人`, `有人`, and `偵測到臉`, with sensitivity presets, event-specific sounds, and highest-priority-only firing.

**Architecture:** Keep person presence logic in `src/presence/state.js`, add focused modules for face sample state and alert-level firing, then wire them through `PresenceCoordinator`. Pass fresh face detector samples from `FacePipeline` into the coordinator so cached face boxes do not count as new evidence.

**Tech Stack:** Browser ES modules, Web Audio API, Web Notifications, `node:test` for pure logic tests, existing manual browser pages for camera/model smoke tests.

**Commit Policy:** Do not create git commits during implementation unless the user explicitly asks.

---

## File Structure

- Modify: `package.json` - add a `test` script for Node's built-in test runner.
- Create: `tests/presence-settings.test.js` - unit tests for presets, normalization, and custom mode detection.
- Create: `tests/face-presence-state.test.js` - unit tests for fresh face sample windows.
- Create: `tests/alert-level-state.test.js` - unit tests for priority transitions and repeat firing.
- Modify: `src/presence/settings.js` - add alert modes, presets, face thresholds, and normalized settings.
- Create: `src/presence/face-state.js` - track fresh face detector samples by `trackId`.
- Create: `src/presence/alert-level.js` - define alert levels, labels, priority, and repeat firing behavior.
- Modify: `src/pipeline/face.js` - mark face results as fresh or cached.
- Modify: `src/presence/coordinator.js` - combine person and face state, bind new UI controls, and fire one highest-priority event.
- Modify: `src/presence/channels/sound.js` - support event-specific tone patterns.
- Modify: `src/presence/channels/visual.js` - support three visual states.
- Modify: `src/presence/channels/notification.js` - include the event label as notification body.
- Modify: `src/app.js` - pass `state.lastFaces` to `presence.tick()`.
- Modify: `index.html` - add reminder mode UI, face advanced controls, event sound test selector, and three-state lamp styling.
- Update: `docs/superpowers/specs/2026-05-25-graded-presence-alert-design.md` only if implementation reveals a needed clarification that the user approves.

---

### Task 1: Add Logic Test Harness

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add a Node test script**

In `package.json`, add the `test` script after `dev`:

```json
{
  "scripts": {
    "dev": "node server.mjs",
    "test": "node --test tests/*.test.js",
    "vendor:ort": "node scripts/vendor-ort.mjs",
    "vendor:human": "node scripts/vendor-human.mjs",
    "verify:vendor": "node scripts/verify-vendor.mjs",
    "verify:pages": "node scripts/verify-vendor.mjs dist",
    "build": "npm run model:fetch && node scripts/build-pages.mjs",
    "model:fetch": "node scripts/fetch-model.mjs",
    "postinstall": "node scripts/vendor-ort.mjs && node scripts/vendor-human.mjs"
  }
}
```

- [ ] **Step 2: Run the empty test harness**

Run: `npm test`

Expected: exit 0 with output indicating zero tests or no matching tests fail. If Node reports no test files as an error on this version, continue to Task 2 and run `npm test` after the first test file exists.

---

### Task 2: Add Sensitivity Presets and Settings Tests

**Files:**
- Create: `tests/presence-settings.test.js`
- Modify: `src/presence/settings.js`

- [ ] **Step 1: Write failing settings tests**

Create `tests/presence-settings.test.js`:

```js
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test`

Expected: FAIL with missing exports such as `ALERT_MODE_STANDARD` or `ALERT_PRESETS`.

- [ ] **Step 3: Implement settings support**

Modify `src/presence/settings.js` so the top of the file defines modes and presets:

```js
export const STORAGE_KEY = 'argus.alertSettings.v1';

export const ALERT_MODE_QUIET = 'quiet';
export const ALERT_MODE_STANDARD = 'standard';
export const ALERT_MODE_SENSITIVE = 'sensitive';
export const ALERT_MODE_CUSTOM = 'custom';

export const ALERT_PRESETS = {
  quiet: {
    consecutiveFrames: 5,
    minPersonCount: 1,
    minScore: 0.4,
    faceWindowMs: 3000,
    faceHits: 2,
    leaveFrames: 8,
    repeatIntervalSec: 30,
  },
  standard: {
    consecutiveFrames: 2,
    minPersonCount: 1,
    minScore: 0.35,
    faceWindowMs: 2000,
    faceHits: 2,
    leaveFrames: 4,
    repeatIntervalSec: 10,
  },
  sensitive: {
    consecutiveFrames: 1,
    minPersonCount: 1,
    minScore: 0.3,
    faceWindowMs: 1500,
    faceHits: 1,
    leaveFrames: 2,
    repeatIntervalSec: 5,
  },
};

export const ALERT_MODES = [
  ALERT_MODE_QUIET,
  ALERT_MODE_STANDARD,
  ALERT_MODE_SENSITIVE,
  ALERT_MODE_CUSTOM,
];
```

Extend the `AlertSettings` typedef:

```js
/**
 * @typedef {object} AlertSettings
 * @property {{ sound: boolean, notification: boolean, visual: boolean }} channels
 * @property {'quiet' | 'standard' | 'sensitive' | 'custom'} alertMode
 * @property {number} consecutiveFrames
 * @property {number} minPersonCount
 * @property {number} repeatIntervalSec
 * @property {boolean} useConfirmedOnly
 * @property {number} minScore
 * @property {number | null} leaveFrames
 * @property {number} faceWindowMs
 * @property {number} faceHits
 * @property {number} soundVolume
 */
```

Set `DEFAULTS` from the standard preset:

```js
const STANDARD_PRESET = ALERT_PRESETS.standard;

export const DEFAULTS = {
  channels: {
    sound: true,
    notification: false,
    visual: true,
  },
  alertMode: ALERT_MODE_STANDARD,
  consecutiveFrames: STANDARD_PRESET.consecutiveFrames,
  minPersonCount: STANDARD_PRESET.minPersonCount,
  repeatIntervalSec: STANDARD_PRESET.repeatIntervalSec,
  useConfirmedOnly: false,
  minScore: STANDARD_PRESET.minScore,
  leaveFrames: STANDARD_PRESET.leaveFrames,
  faceWindowMs: STANDARD_PRESET.faceWindowMs,
  faceHits: STANDARD_PRESET.faceHits,
  soundVolume: 0.7,
};
```

Replace `normalizeSettings()` with this behavior:

```js
export function normalizeSettings(raw) {
  const r = /** @type {Record<string, unknown>} */ (raw ?? {});
  const ch = /** @type {Record<string, unknown>} */ (r.channels ?? {});
  const requestedMode = typeof r.alertMode === 'string' ? r.alertMode : DEFAULTS.alertMode;
  const baseMode = isPresetMode(requestedMode) ? requestedMode : ALERT_MODE_CUSTOM;
  const preset = isPresetMode(baseMode) ? ALERT_PRESETS[baseMode] : DEFAULTS;

  const normalized = {
    channels: {
      sound: bool(ch.sound, DEFAULTS.channels.sound),
      notification: bool(ch.notification, DEFAULTS.channels.notification),
      visual: bool(ch.visual, DEFAULTS.channels.visual),
    },
    alertMode: baseMode,
    consecutiveFrames: clampInt(r.consecutiveFrames, 1, 30, preset.consecutiveFrames),
    minPersonCount: clampInt(r.minPersonCount, 1, 20, preset.minPersonCount),
    repeatIntervalSec: clampInt(r.repeatIntervalSec, 0, 300, preset.repeatIntervalSec),
    useConfirmedOnly: bool(r.useConfirmedOnly, DEFAULTS.useConfirmedOnly),
    minScore: clampFloat(r.minScore, 0, 1, preset.minScore),
    leaveFrames: normalizeLeaveFrames(r.leaveFrames, preset.leaveFrames),
    faceWindowMs: clampInt(r.faceWindowMs, 250, 10_000, preset.faceWindowMs),
    faceHits: clampInt(r.faceHits, 1, 20, preset.faceHits),
    soundVolume: clampFloat(r.soundVolume, 0, 1, DEFAULTS.soundVolume),
  };

  if (isPresetMode(baseMode) && hasAdvancedOverride(r, ALERT_PRESETS[baseMode], normalized)) {
    normalized.alertMode = ALERT_MODE_CUSTOM;
  }

  return normalized;
}
```

Add these helpers near the bottom of `settings.js`:

```js
function isPresetMode(mode) {
  return mode === ALERT_MODE_QUIET || mode === ALERT_MODE_STANDARD || mode === ALERT_MODE_SENSITIVE;
}

function normalizeLeaveFrames(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  return clampInt(raw, 1, 60, fallback);
}

function hasAdvancedOverride(raw, preset, normalized) {
  const keys = [
    'consecutiveFrames',
    'minPersonCount',
    'repeatIntervalSec',
    'minScore',
    'leaveFrames',
    'faceWindowMs',
    'faceHits',
  ];

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    if (normalized[key] !== preset[key]) return true;
  }

  return false;
}
```

Keep `effectiveLeaveFrames(settings)` returning `settings.leaveFrames ?? settings.consecutiveFrames`; after this task, preset settings will provide a numeric `leaveFrames`.

- [ ] **Step 4: Run settings tests**

Run: `npm test`

Expected: PASS for `presence-settings.test.js`.

---

### Task 3: Add Face Presence State

**Files:**
- Create: `tests/face-presence-state.test.js`
- Create: `src/presence/face-state.js`

- [ ] **Step 1: Write failing face state tests**

Create `tests/face-presence-state.test.js`:

```js
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test`

Expected: FAIL because `src/presence/face-state.js` does not exist.

- [ ] **Step 3: Implement `FacePresenceState`**

Create `src/presence/face-state.js`:

```js
/**
 * Face alert state - records fresh face detector samples per person track.
 */

export class FacePresenceState {
  constructor() {
    /** @type {Map<number, number[]>} */
    this.samplesByTrackId = new Map();
  }

  reset() {
    this.samplesByTrackId.clear();
  }

  /**
   * @param {Array<{ trackId: number, fresh?: boolean }>} faces
   * @param {Set<number>} qualifyingTrackIds
   * @param {{ faceWindowMs: number, faceHits: number }} settings
   * @param {number} nowMs
   * @returns {{ present: boolean }}
   */
  tick(faces, qualifyingTrackIds, settings, nowMs) {
    const windowStart = nowMs - settings.faceWindowMs;

    for (const [trackId, samples] of this.samplesByTrackId) {
      const freshSamples = samples.filter((sampleMs) => sampleMs >= windowStart);
      if (freshSamples.length && qualifyingTrackIds.has(trackId)) {
        this.samplesByTrackId.set(trackId, freshSamples);
      } else {
        this.samplesByTrackId.delete(trackId);
      }
    }

    for (const face of faces) {
      if (!face.fresh) continue;
      if (!qualifyingTrackIds.has(face.trackId)) continue;
      const samples = this.samplesByTrackId.get(face.trackId) ?? [];
      samples.push(nowMs);
      this.samplesByTrackId.set(face.trackId, samples);
    }

    for (const trackId of qualifyingTrackIds) {
      const samples = this.samplesByTrackId.get(trackId) ?? [];
      if (samples.length >= settings.faceHits) {
        return { present: true };
      }
    }

    return { present: false };
  }
}
```

- [ ] **Step 4: Run face state tests**

Run: `npm test`

Expected: PASS for `face-presence-state.test.js` and existing settings tests.

---

### Task 4: Add Alert Level State

**Files:**
- Create: `tests/alert-level-state.test.js`
- Create: `src/presence/alert-level.js`

- [ ] **Step 1: Write failing alert level tests**

Create `tests/alert-level-state.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALERT_FACE,
  ALERT_NONE,
  ALERT_PERSON,
  ALERT_LABELS,
  AlertLevelState,
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

test('reset returns to none', () => {
  const state = new AlertLevelState();

  state.tick(ALERT_FACE, { repeatIntervalSec: 10 }, 1000);
  state.reset();

  assert.equal(state.level, ALERT_NONE);
  assert.equal(state.tick(ALERT_FACE, { repeatIntervalSec: 10 }, 1200).fire, true);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test`

Expected: FAIL because `src/presence/alert-level.js` does not exist.

- [ ] **Step 3: Implement alert-level state**

Create `src/presence/alert-level.js`:

```js
/**
 * Alert levels and firing rules for graded presence alerts.
 */

export const ALERT_NONE = 'none';
export const ALERT_PERSON = 'person';
export const ALERT_FACE = 'face';

export const ALERT_LABELS = {
  [ALERT_NONE]: '無人',
  [ALERT_PERSON]: '有人',
  [ALERT_FACE]: '偵測到臉',
};

const PRIORITY = {
  [ALERT_NONE]: 0,
  [ALERT_PERSON]: 1,
  [ALERT_FACE]: 2,
};

export class AlertLevelState {
  constructor() {
    this.level = ALERT_NONE;
    this.lastFireMs = 0;
  }

  reset() {
    this.level = ALERT_NONE;
    this.lastFireMs = 0;
  }

  /**
   * @param {'none' | 'person' | 'face'} nextLevel
   * @param {{ repeatIntervalSec: number }} settings
   * @param {number} nowMs
   * @returns {{ fire: boolean, level: 'none' | 'person' | 'face', label: string }}
   */
  tick(nextLevel, settings, nowMs) {
    const previous = this.level;
    this.level = nextLevel;

    let fire = false;
    if (nextLevel === ALERT_NONE) {
      this.lastFireMs = 0;
      return { fire, level: this.level, label: ALERT_LABELS[this.level] };
    }

    const enteredFromNone = previous === ALERT_NONE;
    const upgraded = PRIORITY[nextLevel] > PRIORITY[previous];
    if (enteredFromNone || upgraded) {
      fire = true;
      this.lastFireMs = nowMs;
      return { fire, level: this.level, label: ALERT_LABELS[this.level] };
    }

    const intervalMs = settings.repeatIntervalSec * 1000;
    if (intervalMs > 0 && this.lastFireMs > 0 && nowMs - this.lastFireMs >= intervalMs) {
      fire = true;
      this.lastFireMs = nowMs;
    }

    return { fire, level: this.level, label: ALERT_LABELS[this.level] };
  }
}
```

- [ ] **Step 4: Run alert level tests**

Run: `npm test`

Expected: PASS for settings, face state, and alert level tests.

---

### Task 5: Mark Fresh and Cached Face Results

**Files:**
- Modify: `src/pipeline/face.js`

- [ ] **Step 1: Extend the `Face` typedef**

In `src/pipeline/face.js`, add `fresh` to the typedef:

```js
/**
 * @typedef Face
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} score
 * @property {number} trackId
 * @property {boolean} fresh true when produced by a detector run in this frame
 */
```

- [ ] **Step 2: Mark cached faces as not fresh**

Inside the `if (!due)` block, replace cached push logic with:

```js
if (!due) {
  if (track.lastFaces?.length) {
    out.push(...track.lastFaces.map((face) => ({ ...face, fresh: false })));
  }
  continue;
}
```

- [ ] **Step 3: Mark detector results as fresh**

When creating `batch.push(...)`, include `fresh: true`:

```js
batch.push({
  x1: bx + sx,
  y1: by + sy,
  x2: bx + bw + sx,
  y2: by + bh + sy,
  score: f.score ?? f.boxScore ?? 0,
  trackId: track.id,
  fresh: true,
});
```

- [ ] **Step 4: Run logic tests**

Run: `npm test`

Expected: PASS. These tests do not execute the browser-only Human pipeline, but they verify the consumers of the `fresh` flag.

---

### Task 6: Integrate Graded Alert State in Coordinator

**Files:**
- Modify: `src/presence/coordinator.js`
- Modify: `src/app.js`

- [ ] **Step 1: Import new state modules and helpers**

At the top of `src/presence/coordinator.js`, replace the state import with:

```js
import { PresenceState, trackCountsAsPerson } from './state.js';
import { FacePresenceState } from './face-state.js';
import { ALERT_FACE, ALERT_NONE, ALERT_PERSON, AlertLevelState } from './alert-level.js';
```

- [ ] **Step 2: Add state objects in the constructor**

In the constructor, keep `this.state = new PresenceState();` and add:

```js
this.faceState = new FacePresenceState();
this.alertState = new AlertLevelState();
```

- [ ] **Step 3: Update `tick` to accept faces and emit one level**

Replace `tick(tracks)` with:

```js
/**
 * @param {import('../tracker/bytetrack-lite.js').Track[]} tracks
 * @param {import('../pipeline/face.js').Face[]} faces
 */
tick(tracks, faces = []) {
  if (!this._running) return;

  const nowMs = performance.now();
  const personResult = this.state.tick(tracks, this.settings, nowMs);
  const qualifyingTrackIds = new Set(
    tracks.filter((track) => trackCountsAsPerson(track, this.settings)).map((track) => track.id),
  );
  const faceResult = personResult.present
    ? this.faceState.tick(faces, qualifyingTrackIds, this.settings, nowMs)
    : { present: false };
  const level = faceResult.present
    ? ALERT_FACE
    : personResult.present
      ? ALERT_PERSON
      : ALERT_NONE;
  const alertResult = this.alertState.tick(level, this.settings, nowMs);

  if (this.settings.channels.visual) {
    this.visual.setState(alertResult.level, alertResult.label);
  } else {
    this.visual.clear();
  }

  if (alertResult.fire) this._fireChannels(alertResult.level, alertResult.label);
}
```

- [ ] **Step 4: Update `_fireChannels`**

Replace `_fireChannels()` with:

```js
_fireChannels(level, label) {
  const { channels, soundVolume } = this.settings;
  if (channels.sound) this.sound.play(soundVolume, level);
  if (channels.notification) fireNotification(label);
}
```

- [ ] **Step 5: Reset all state on stop**

In `stop()`, add resets:

```js
this.state.reset();
this.faceState.reset();
this.alertState.reset();
this.visual.clear();
```

- [ ] **Step 6: Pass faces from app**

In `src/app.js`, change:

```js
if (state.running) presence.tick(state.lastTracks);
```

to:

```js
if (state.running) presence.tick(state.lastTracks, state.lastFaces);
```

- [ ] **Step 7: Run logic tests**

Run: `npm test`

Expected: PASS. If this fails because browser globals are imported in tests, keep coordinator out of Node tests and verify this task with `npm run build` in Task 10.

---

### Task 7: Update Sound, Visual, and Notification Channels

**Files:**
- Modify: `src/presence/channels/sound.js`
- Modify: `src/presence/channels/visual.js`
- Modify: `src/presence/channels/notification.js`

- [ ] **Step 1: Add event-specific sounds**

In `src/presence/channels/sound.js`, change `play(volume = 0.7)` to:

```js
/**
 * @param {number} volume 0-1
 * @param {'person' | 'face' | 'none'} level
 */
play(volume = 0.7, level = 'person') {
  if (!this.ctx || !this.unlocked) return;
  if (level === 'face') {
    this._playTone(volume, 1046, 0);
    this._playTone(volume, 1318, 0.13);
    return;
  }
  this._playTone(volume, 740, 0);
}

_playTone(volume, frequency, offsetSec) {
  if (!this.ctx) return;
  const t0 = this.ctx.currentTime + offsetSec;
  const osc = this.ctx.createOscillator();
  const gain = this.ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const v = Math.max(0, Math.min(1, volume));
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(v * 0.35, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
  osc.connect(gain);
  gain.connect(this.ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.14);
}
```

- [ ] **Step 2: Add three-state visual support**

In `src/presence/channels/visual.js`, replace `setPresent(present)` with:

```js
setState(level, label) {
  if (this._level === level) return;
  this._level = level;
  const active = level !== 'none';
  if (this.stage) {
    this.stage.classList.toggle('presence-present', active);
    this.stage.classList.toggle('presence-face', level === 'face');
  }
  if (this.lamp) {
    this.lamp.dataset.state = level;
    this.lamp.setAttribute('aria-label', label);
  }
}
```

Update the constructor field from `_present` to `_level`:

```js
this._level = 'none';
```

Update `clear()`:

```js
clear() {
  this.setState('none', '無人');
}
```

- [ ] **Step 3: Include event label in notification body**

In `src/presence/channels/notification.js`, change `fireNotification()` to accept a label:

```js
export function fireNotification(label = '') {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification(APP_TITLE, {
      body: label,
      silent: false,
      tag: 'argus-presence',
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    setTimeout(() => n.close(), 1200);
  } catch (err) {
    console.warn('[presence] notification failed:', err);
  }
}
```

- [ ] **Step 4: Run logic tests**

Run: `npm test`

Expected: PASS.

---

### Task 8: Update Settings UI Binding and Mark Custom Mode

**Files:**
- Modify: `index.html`
- Modify: `src/presence/coordinator.js`

- [ ] **Step 1: Add UI controls to `index.html`**

In the alert settings section, add a mode row above the threshold row:

```html
<div class="alert-row">
  <label>
    提醒模式
    <select id="alert-mode">
      <option value="quiet">安靜</option>
      <option value="standard">標準</option>
      <option value="sensitive">敏感</option>
      <option value="custom">自訂</option>
    </select>
  </label>
  <span class="alert-muted">一般使用建議選「標準」；細項調整後會變成「自訂」。</span>
</div>
```

Inside the advanced row, add face controls:

```html
<label>臉部時間窗 <input type="number" id="alert-face-window" min="250" max="10000" step="250" value="2000"> ms</label>
<label>臉部命中次數 <input type="number" id="alert-face-hits" min="1" max="20" value="2"></label>
```

In the sound extras row, add an event sound selector before the test button:

```html
<label>
  測試事件
  <select id="alert-test-event">
    <option value="person">有人</option>
    <option value="face">偵測到臉</option>
  </select>
</label>
```

- [ ] **Step 2: Add select styling**

In `index.html`, extend the existing number input style selector:

```css
.alert-row input[type="number"],
.alert-row select {
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #2a3140;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
}
.alert-row input[type="number"] {
  width: 4.5rem;
}
```

- [ ] **Step 3: Bind new controls**

In `src/presence/coordinator.js`, import presets:

```js
import { loadSettings, saveSettings, DEFAULTS, ALERT_PRESETS } from './settings.js';
```

Inside `bindUI()`, add element lookups:

```js
const mode = /** @type {HTMLSelectElement | null} */ (document.getElementById('alert-mode'));
const faceWindow = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-face-window'));
const faceHits = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-face-hits'));
const testEvent = /** @type {HTMLSelectElement | null} */ (document.getElementById('alert-test-event'));
```

Inside `applyToForm()`, sync the values:

```js
if (mode) mode.value = s.alertMode;
if (faceWindow) faceWindow.value = String(s.faceWindowMs);
if (faceHits) faceHits.value = String(s.faceHits);
```

Add listeners:

```js
mode?.addEventListener('change', () => {
  const selected = mode.value;
  const preset = ALERT_PRESETS[selected];
  if (preset) {
    persist({ alertMode: selected, ...preset });
  } else {
    persist({ alertMode: 'custom' });
  }
});

faceWindow?.addEventListener('change', () => {
  persist({ alertMode: 'custom', faceWindowMs: Number(faceWindow.value) });
});

faceHits?.addEventListener('change', () => {
  persist({ alertMode: 'custom', faceHits: Number(faceHits.value) });
});
```

Update existing advanced listeners so each one also sets custom mode:

```js
frames?.addEventListener('change', () => {
  persist({ alertMode: 'custom', consecutiveFrames: Number(frames.value) });
});
minPersons?.addEventListener('change', () => {
  persist({ alertMode: 'custom', minPersonCount: Number(minPersons.value) });
});
interval?.addEventListener('change', () => {
  persist({ alertMode: 'custom', repeatIntervalSec: Number(interval.value) });
});
minScore?.addEventListener('change', () => {
  persist({ alertMode: 'custom', minScore: Number(minScore.value) });
});
leaveFrames?.addEventListener('change', () => {
  const v = leaveFrames.value.trim();
  persist({ alertMode: 'custom', leaveFrames: v === '' ? null : Number(v) });
});
```

Update the test sound handler:

```js
testBtn?.addEventListener('click', async () => {
  await this.sound.unlock();
  const level = testEvent?.value === 'face' ? 'face' : 'person';
  this.sound.play(this.settings.soundVolume, level);
  this._refreshStatus();
});
```

- [ ] **Step 4: Run logic tests**

Run: `npm test`

Expected: PASS.

---

### Task 9: Update Three-State Lamp Copy and Styling

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace lamp label CSS**

Replace the current presence lamp label rules:

```css
.presence-lamp[data-state="present"] .label::after { content: '有人'; }
.presence-lamp[data-state="absent"] .label::after { content: '無人'; }
```

with:

```css
.presence-lamp[data-state="none"] .label::after { content: '無人'; }
.presence-lamp[data-state="person"] .label::after { content: '有人'; }
.presence-lamp[data-state="face"] .label::after { content: '偵測到臉'; }
```

- [ ] **Step 2: Update lamp colors**

Replace the present-only lamp rules with:

```css
.presence-lamp[data-state="person"] .dot {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.7);
}
.presence-lamp[data-state="face"] .dot {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.7);
}
.stage.presence-face {
  box-shadow: 0 0 0 2px var(--danger), 0 0 24px rgba(248, 113, 113, 0.25);
}
```

- [ ] **Step 3: Update initial lamp markup**

Change:

```html
<div id="presence-lamp" class="presence-lamp" data-state="absent" aria-label="無人">
```

to:

```html
<div id="presence-lamp" class="presence-lamp" data-state="none" aria-label="無人">
```

- [ ] **Step 4: Run logic tests**

Run: `npm test`

Expected: PASS.

---

### Task 10: Build and Manual Browser Verification

**Files:**
- No code changes unless verification exposes a defect.

- [ ] **Step 1: Run unit tests**

Run: `npm test`

Expected: all `node:test` tests pass with exit 0.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: exit 0, `dist/` is created with copied app assets and vendored model files.

- [ ] **Step 3: Verify Pages bundle**

Run: `npm run verify:pages`

Expected: exit 0 with no missing vendor/model files.

- [ ] **Step 4: Manual smoke in browser**

Run: `npm run dev`

Expected: local server prints a localhost URL. Open the app and verify:

- With no person in frame, lamp shows `無人` and no sound plays.
- With a person but no visible face, lamp shows `有人` and the single-tone sound plays once.
- With a visible face, lamp shows `偵測到臉` and only the face sound plays.
- When a person first appears without a face and later turns toward the camera, the alert upgrades to `偵測到臉`.
- Changing `提醒模式` updates advanced values.
- Changing any advanced value changes mode to `自訂`.
- The event sound test selector plays different patterns for `有人` and `偵測到臉`.
- Stop clears the lamp to `無人` and prevents further alerts.

---

## Self-Review Checklist

- Spec coverage: Tasks 2 and 8 cover presets and UI; Tasks 3, 4, 5, and 6 cover detection and priority; Task 7 covers channels; Task 9 covers copy and visual state; Task 10 covers manual and build verification.
- Red-flag scan: No implementation step relies on unspecified behavior.
- Type consistency: Internal alert levels are `'none'`, `'person'`, and `'face'`; UI labels are `無人`, `有人`, and `偵測到臉`; settings fields are `alertMode`, `faceWindowMs`, and `faceHits`.
- Scope check: The plan does not add gaze estimation, recording, history, push after tab close, or identity recognition.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-05-25-graded-presence-alert-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, with checkpoints for review.

Which approach should we use?
