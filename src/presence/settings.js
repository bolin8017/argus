/**
 * Presence alert settings — defaults, validation, localStorage persistence.
 */

export const STORAGE_KEY = 'argus.alertSettings.v1';

/**
 * @typedef {object} AlertSettings
 * @property {{ sound: boolean, notification: boolean, visual: boolean }} channels
 * @property {number} consecutiveFrames
 * @property {number} repeatIntervalSec
 * @property {boolean} useConfirmedOnly
 * @property {number} minScore
 * @property {number | null} leaveFrames
 * @property {number} soundVolume
 */

export const DEFAULTS = {
  channels: {
    sound: true,
    notification: false,
    visual: true,
  },
  consecutiveFrames: 1,
  repeatIntervalSec: 10,
  useConfirmedOnly: false,
  minScore: 0.35,
  leaveFrames: null,
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

  const consecutiveFrames = clampInt(r.consecutiveFrames, 1, 30, DEFAULTS.consecutiveFrames);
  const leaveFramesRaw = r.leaveFrames;
  const leaveFrames =
    leaveFramesRaw == null || leaveFramesRaw === ''
      ? null
      : clampInt(leaveFramesRaw, 1, 60, consecutiveFrames);

  return {
    channels: {
      sound: bool(ch.sound, DEFAULTS.channels.sound),
      notification: bool(ch.notification, DEFAULTS.channels.notification),
      visual: bool(ch.visual, DEFAULTS.channels.visual),
    },
    consecutiveFrames,
    repeatIntervalSec: clampInt(r.repeatIntervalSec, 0, 300, DEFAULTS.repeatIntervalSec),
    useConfirmedOnly: bool(r.useConfirmedOnly, DEFAULTS.useConfirmedOnly),
    minScore: clampFloat(r.minScore, 0, 1, DEFAULTS.minScore),
    leaveFrames,
    soundVolume: clampFloat(r.soundVolume, 0, 1, DEFAULTS.soundVolume),
  };
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
