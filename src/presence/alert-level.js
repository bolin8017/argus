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
    const downgraded = PRIORITY[nextLevel] < PRIORITY[previous];
    if (enteredFromNone || upgraded) {
      fire = true;
      this.lastFireMs = nowMs;
      return { fire, level: this.level, label: ALERT_LABELS[this.level] };
    }
    if (downgraded) {
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

export function shouldSuppressPersonAlert(currentLevel, actualLevel, hasRecentFaceSample) {
  return currentLevel === ALERT_NONE && actualLevel === ALERT_PERSON && hasRecentFaceSample;
}
