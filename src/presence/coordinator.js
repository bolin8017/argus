/**
 * Presence alert coordinator — wires settings, state machine, and channels.
 */

import { loadSettings, saveSettings, DEFAULTS } from './settings.js';
import { PresenceState } from './state.js';
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
    const frames = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-frames'));
    const minPersons = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-min-persons'));
    const interval = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-interval'));
    const confirmedOnly = /** @type {HTMLInputElement | null} */ (
      document.getElementById('alert-confirmed-only')
    );
    const minScore = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-min-score'));
    const leaveFrames = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-leave-frames'));
    const volume = /** @type {HTMLInputElement | null} */ (document.getElementById('alert-volume'));
    const testBtn = document.getElementById('alert-test-sound');
    const advToggle = document.getElementById('alert-advanced-toggle');
    const advPanel = document.getElementById('alert-advanced');
    const soundExtras = document.getElementById('alert-sound-extras');
    const notifHint = document.getElementById('alert-notif-hint');

    const applyToForm = () => {
      const s = this.settings;
      if (chSound) chSound.checked = s.channels.sound;
      if (chNotif) chNotif.checked = s.channels.notification;
      if (chVisual) chVisual.checked = s.channels.visual;
      if (frames) frames.value = String(s.consecutiveFrames);
      if (minPersons) minPersons.value = String(s.minPersonCount);
      if (interval) interval.value = String(s.repeatIntervalSec);
      if (confirmedOnly) confirmedOnly.checked = s.useConfirmedOnly;
      if (minScore) minScore.value = String(s.minScore);
      if (leaveFrames) leaveFrames.value = s.leaveFrames == null ? '' : String(s.leaveFrames);
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
    frames?.addEventListener('change', () => {
      persist({ consecutiveFrames: Number(frames.value) });
    });
    minPersons?.addEventListener('change', () => {
      persist({ minPersonCount: Number(minPersons.value) });
    });
    interval?.addEventListener('change', () => {
      persist({ repeatIntervalSec: Number(interval.value) });
    });
    confirmedOnly?.addEventListener('change', () => {
      persist({ useConfirmedOnly: confirmedOnly.checked });
    });
    minScore?.addEventListener('change', () => {
      persist({ minScore: Number(minScore.value) });
    });
    leaveFrames?.addEventListener('change', () => {
      const v = leaveFrames.value.trim();
      persist({ leaveFrames: v === '' ? null : Number(v) });
    });
    volume?.addEventListener('input', () => {
      persist({ soundVolume: Number(volume.value) });
    });

    testBtn?.addEventListener('click', async () => {
      await this.sound.unlock();
      this.sound.play(this.settings.soundVolume);
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
   */
  tick(tracks) {
    if (!this._running) return;

    const { fire, present } = this.state.tick(tracks, this.settings, performance.now());

    if (this.settings.channels.visual) {
      this.visual.setPresent(present);
    } else {
      this.visual.clear();
    }

    if (fire) this._fireChannels();
  }

  _fireChannels() {
    const { channels, soundVolume } = this.settings;
    if (channels.sound) this.sound.play(soundVolume);
    if (channels.notification) fireNotification();
  }

  stop() {
    this._running = false;
    this.state.reset();
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
