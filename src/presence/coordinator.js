/**
 * Presence alert coordinator — wires settings, state machine, and channels.
 */

import { loadSettings, saveSettings, DEFAULTS, ALERT_PRESETS } from './settings.js';
import { PresenceState, meetsPersonThreshold, trackCountsAsPerson } from './state.js';
import { FacePresenceState } from './face-state.js';
import {
  ALERT_FACE,
  ALERT_LABELS,
  ALERT_NONE,
  ALERT_PERSON,
  AlertLevelState,
  shouldSuppressPersonAlert,
} from './alert-level.js';
import { SoundChannel } from './channels/sound.js';
import {
  fireNotification,
  getNotificationPermission,
  permissionLabelZh,
  requestNotificationPermission,
} from './channels/notification.js';
import { VisualChannel } from './channels/visual.js';

export class PresenceCoordinator {
  constructor() {
    /** @type {import('./settings.js').AlertSettings} */ this.settings = loadSettings();
    this.state = new PresenceState();
    this.faceState = new FacePresenceState();
    this.alertState = new AlertLevelState();
    this.sound = new SoundChannel();
    this.visual = new VisualChannel({
      stage: document.querySelector('.stage'),
      lamp: document.getElementById('presence-lamp'),
    });
    this._running = false;
    this._uiBound = false;
  }

  /** Bind alert settings panel; safe to call once on load. */
  bindUI() {
    if (this._uiBound) return;
    this._uiBound = true;
    const panel = document.getElementById('alert-settings');
    if (!panel) return;

    const chSound = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-ch-sound'));
    const chNotif = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-ch-notification'));
    const chVisual = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-ch-visual'));
    const mode = /** @type {HTMLSelectElement | null} */ (document.getElementById('alert-mode'));
    const frames = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-frames'));
    const minPersons = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-min-persons'));
    const interval = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-interval'));
    const confirmedOnly = /** @type {HTMLInputElement | null} */ (
      document.getElementById('alert-confirmed-only')
    );
    const minScore = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-min-score'));
    const leaveFrames = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-leave-frames'));
    const faceWindow = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-face-window'));
    const faceHits = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-face-hits'));
    const volume = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-volume'));
    const testBtn = document.getElementById('alert-test-sound');
    const testEvent = /** @type {HTMLSelectElement | null} */ (document.getElementById('alert-test-event'));
    const advToggle = document.getElementById('alert-advanced-toggle');
    const advPanel = document.getElementById('alert-advanced');
    const soundExtras = document.getElementById('alert-sound-extras');
    const notifHint = document.getElementById('alert-notif-hint');

    const applyToForm = () => {
      const s = this.settings;
      if (chSound) chSound.checked = s.channels.sound;
      if (chNotif) chNotif.checked = s.channels.notification;
      if (chVisual) chVisual.checked = s.channels.visual;
      if (mode) mode.value = s.alertMode;
      if (frames) frames.value = String(s.consecutiveFrames);
      if (minPersons) minPersons.value = String(s.minPersonCount);
      if (interval) interval.value = String(s.repeatIntervalSec);
      if (confirmedOnly) confirmedOnly.checked = s.useConfirmedOnly;
      if (minScore) minScore.value = String(s.minScore);
      if (leaveFrames) leaveFrames.value = s.leaveFrames == null ? '' : String(s.leaveFrames);
      if (faceWindow) faceWindow.value = String(s.faceWindowMs);
      if (faceHits) faceHits.value = String(s.faceHits);
      if (volume) volume.value = String(s.soundVolume);
      if (soundExtras) soundExtras.hidden = !s.channels.sound;
      this._refreshStatus(notifHint);
    };

    const persist = (partial) => {
      this.settings = saveSettings(partial);
      applyToForm();
    };

    chSound?.addEventListener('change', () => {
      persist({ channels: { ...this.settings.channels, sound: chSound.checked } });
    });
    chNotif?.addEventListener('change', async () => {
      const enabled = chNotif.checked;
      persist({ channels: { ...this.settings.channels, notification: enabled } });
      if (enabled && getNotificationPermission() === 'default') {
        await requestNotificationPermission();
        this._refreshStatus(notifHint);
      }
    });
    chVisual?.addEventListener('change', () => {
      persist({ channels: { ...this.settings.channels, visual: chVisual.checked } });
    });
    mode?.addEventListener('change', () => {
      const selected = mode.value;
      const preset = ALERT_PRESETS[selected];
      if (preset) {
        persist({ alertMode: selected, ...preset });
      } else {
        persist({ alertMode: 'custom' });
      }
    });
    frames?.addEventListener('change', () => {
      persist({ alertMode: 'custom', consecutiveFrames: Number(frames.value) });
    });
    const persistMinPersons = () => {
      persist({ alertMode: 'custom', minPersonCount: Number(minPersons.value) });
    };
    minPersons?.addEventListener('change', persistMinPersons);
    minPersons?.addEventListener('input', persistMinPersons);
    interval?.addEventListener('change', () => {
      persist({ alertMode: 'custom', repeatIntervalSec: Number(interval.value) });
    });
    confirmedOnly?.addEventListener('change', () => {
      persist({ alertMode: 'custom', useConfirmedOnly: confirmedOnly.checked });
    });
    minScore?.addEventListener('change', () => {
      persist({ alertMode: 'custom', minScore: Number(minScore.value) });
    });
    leaveFrames?.addEventListener('change', () => {
      const v = leaveFrames.value.trim();
      persist({ alertMode: 'custom', leaveFrames: v === '' ? null : Number(v) });
    });
    faceWindow?.addEventListener('change', () => {
      persist({ alertMode: 'custom', faceWindowMs: Number(faceWindow.value) });
    });
    faceHits?.addEventListener('change', () => {
      persist({ alertMode: 'custom', faceHits: Number(faceHits.value) });
    });
    volume?.addEventListener('input', () => {
      persist({ soundVolume: Number(volume.value) });
    });

    testBtn?.addEventListener('click', async () => {
      await this.sound.unlock();
      const level = testEvent?.value === 'face' ? 'face' : 'person';
      this.sound.play(this.settings.soundVolume, level);
      this._refreshStatus();
    });

    advToggle?.addEventListener('click', () => {
      const open = advPanel?.hidden ?? true;
      if (advPanel) advPanel.hidden = !open;
      advToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    applyToForm();
  }

  _refreshStatus(notifHint = null) {
    const permEl = document.getElementById('alert-notif-perm');
    const audioEl = document.getElementById('alert-audio-status');
    const perm = getNotificationPermission();
    if (permEl) permEl.textContent = permissionLabelZh(perm);
    if (audioEl) audioEl.textContent = this.sound.isUnlocked() ? '已解鎖' : '未解鎖';

    const hint = notifHint ?? document.getElementById('alert-notif-hint');
    if (hint) {
      const want = this.settings.channels.notification;
      hint.hidden = !want || perm !== 'denied';
    }
  }

  /** Call on Start (user gesture) before the inference loop runs. */
  async onSessionStart() {
    this._running = true;
    await this.sound.unlock();
    if (this.settings.channels.notification && getNotificationPermission() === 'default') {
      await requestNotificationPermission();
    }
    this._refreshStatus();
  }

  /**
   * @param {import('../tracker/bytetrack-lite.js').Track[]} tracks
   * @param {import('../pipeline/face.js').Face[]} faces
   */
  tick(tracks, faces = []) {
    if (!this._running) return;

    const nowMs = performance.now();
    const personThresholdMet = meetsPersonThreshold(tracks, this.settings);
    const personResult = this.state.tick(tracks, this.settings, nowMs);
    const qualifyingTrackIds = new Set(
      tracks.filter((track) => trackCountsAsPerson(track, this.settings)).map((track) => track.id),
    );
    const faceResult = this.faceState.tick(
      faces,
      qualifyingTrackIds,
      this.settings,
      nowMs,
      personThresholdMet,
    );
    const actualLevel = faceResult.present
      ? ALERT_FACE
      : personResult.present
        ? ALERT_PERSON
        : ALERT_NONE;
    const hasRecentFaceSample = this.faceState.hasRecentSamples(
      qualifyingTrackIds,
      this.settings,
      nowMs,
      personThresholdMet,
    );
    const firingLevel = shouldSuppressPersonAlert(
      this.alertState.level,
      actualLevel,
      hasRecentFaceSample,
    )
      ? ALERT_NONE
      : actualLevel;
    const alertResult = this.alertState.tick(firingLevel, this.settings, nowMs);

    if (this.settings.channels.visual) {
      this.visual.setState(actualLevel, ALERT_LABELS[actualLevel]);
    } else {
      this.visual.clear();
    }

    if (alertResult.fire) this._fireChannels(alertResult.level, alertResult.label);
  }

  _fireChannels(level, label) {
    const { channels, soundVolume } = this.settings;
    if (channels.sound) this.sound.play(soundVolume, level);
    if (channels.notification) fireNotification(label);
  }

  stop() {
    this._running = false;
    this.state.reset();
    this.faceState.reset();
    this.alertState.reset();
    this.visual.clear();
  }

  resetToDefaults() {
    this.settings = saveSettings({ ...DEFAULTS, channels: { ...DEFAULTS.channels } });
  }
}

/** @type {PresenceCoordinator | null} */
let _singleton = null;

export function getPresenceCoordinator() {
  if (!_singleton) {
    _singleton = new PresenceCoordinator();
    _singleton.bindUI();
  }
  return _singleton;
}
