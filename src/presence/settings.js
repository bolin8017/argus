/**
 * Presence alert settings — defaults, validation, localStorage persistence.
 */

export const STORAGE_KEY = 'argus.alertSettings.v1';

export const ALERT_MODE_QUIET = 'quiet';
export const ALERT_MODE_STANDARD = 'standard';
export const ALERT_MODE_SENSITIVE = 'sensitive';
export const ALERT_MODE_CUSTOM = 'custom';

export const ALERT_PRESETS = {
  quiet: {
    consecutiveFrames: 5,
    minPersonCount: 1,
    useConfirmedOnly: false,
    minScore: 0.4,
    faceWindowMs: 3000,
    faceHits: 2,
    leaveFrames: 8,
    repeatIntervalSec: 30,
  },
  standard: {
    consecutiveFrames: 2,
    minPersonCount: 1,
    useConfirmedOnly: false,
    minScore: 0.35,
    faceWindowMs: 2000,
    faceHits: 2,
    leaveFrames: 4,
    repeatIntervalSec: 10,
  },
  sensitive: {
    consecutiveFrames: 1,
    minPersonCount: 1,
    useConfirmedOnly: false,
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
  useConfirmedOnly: STANDARD_PRESET.useConfirmedOnly,
  minScore: STANDARD_PRESET.minScore,
  leaveFrames: STANDARD_PRESET.leaveFrames,
  faceWindowMs: STANDARD_PRESET.faceWindowMs,
  faceHits: STANDARD_PRESET.faceHits,
  soundVolume: 0.7,
};

/**
 * @returns {AlertSettings}
 */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, channels: { ...DEFAULTS.channels } };
    const parsed = JSON.parse(raw);
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULTS, channels: { ...DEFAULTS.channels } };
  }
}

/**
 * @param {Partial<AlertSettings>} partial
 */
export function saveSettings(partial) {
  const next = normalizeSettings({ ...loadSettings(), ...partial });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * @param {unknown} raw
 * @returns {AlertSettings}
 */
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
    useConfirmedOnly: bool(r.useConfirmedOnly, preset.useConfirmedOnly),
    minScore: clampFloat(r.minScore, 0, 1, preset.minScore),
    leaveFrames: normalizeLeaveFrames(r.leaveFrames, preset.leaveFrames, baseMode === ALERT_MODE_CUSTOM),
    faceWindowMs: clampInt(r.faceWindowMs, 250, 10_000, preset.faceWindowMs),
    faceHits: clampInt(r.faceHits, 1, 20, preset.faceHits),
    soundVolume: clampFloat(r.soundVolume, 0, 1, DEFAULTS.soundVolume),
  };

  if (isPresetMode(baseMode) && hasAdvancedOverride(r, ALERT_PRESETS[baseMode], normalized)) {
    normalized.alertMode = ALERT_MODE_CUSTOM;
  }

  return normalized;
}

/** @returns {number} */
export function effectiveLeaveFrames(settings) {
  return settings.leaveFrames ?? settings.consecutiveFrames;
}

function bool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isPresetMode(mode) {
  return mode === ALERT_MODE_QUIET || mode === ALERT_MODE_STANDARD || mode === ALERT_MODE_SENSITIVE;
}

function normalizeLeaveFrames(raw, fallback, preserveEmpty = false) {
  if (preserveEmpty && (raw == null || raw === '')) return null;
  if (raw == null || raw === '') return fallback;
  return clampInt(raw, 1, 60, fallback);
}

function hasAdvancedOverride(raw, preset, normalized) {
  const keys = [
    'consecutiveFrames',
    'minPersonCount',
    'repeatIntervalSec',
    'useConfirmedOnly',
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
