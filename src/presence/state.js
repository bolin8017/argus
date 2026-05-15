/**
 * Presence state machine — frame counters, hysteresis, repeat interval.
 */

import { effectiveLeaveFrames } from './settings.js';

/**
 * @typedef {'absent' | 'present'} PresenceMode
 */

export class PresenceState {
  constructor() {
    /** @type {PresenceMode} */
    this.mode = 'absent';
    this.presentStreak = 0;
    this.absentStreak = 0;
    /** @type {number} */ this.lastFireMs = 0;
  }

  reset() {
    this.mode = 'absent';
    this.presentStreak = 0;
    this.absentStreak = 0;
    this.lastFireMs = 0;
  }

  /**
   * @param {import('../tracker/bytetrack-lite.js').Track[]} tracks
   * @param {import('./settings.js').AlertSettings} settings
   * @param {number} nowMs
   * @returns {{ fire: boolean, present: boolean, edgeEnter: boolean }}
   */
  tick(tracks, settings, nowMs) {
    const hasPerson = tracks.some((t) => trackCountsAsPerson(t, settings));
    let fire = false;
    let edgeEnter = false;

    if (this.mode === 'absent') {
      if (hasPerson) {
        this.presentStreak += 1;
        if (this.presentStreak >= settings.consecutiveFrames) {
          this.mode = 'present';
          this.absentStreak = 0;
          edgeEnter = true;
          fire = true;
          this.lastFireMs = nowMs;
        }
      } else {
        this.presentStreak = 0;
      }
    } else {
      const leaveM = effectiveLeaveFrames(settings);
      if (!hasPerson) {
        this.absentStreak += 1;
        if (this.absentStreak >= leaveM) {
          this.mode = 'absent';
          this.presentStreak = 0;
          this.absentStreak = 0;
        }
      } else {
        this.absentStreak = 0;
        const intervalSec = settings.repeatIntervalSec;
        if (intervalSec > 0 && this.lastFireMs > 0) {
          const elapsed = nowMs - this.lastFireMs;
          if (elapsed >= intervalSec * 1000) {
            fire = true;
            this.lastFireMs = nowMs;
          }
        }
      }
    }

    return {
      fire,
      present: this.mode === 'present',
      edgeEnter,
    };
  }
}

/**
 * @param {import('../tracker/bytetrack-lite.js').Track} t
 * @param {import('./settings.js').AlertSettings} settings
 */
export function trackCountsAsPerson(t, settings) {
  if (t.missed !== 0) return false;
  if (settings.useConfirmedOnly && !t.confirmed) return false;
  if (t.score < settings.minScore) return false;
  return true;
}
