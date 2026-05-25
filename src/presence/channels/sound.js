/**
 * In-page alert sound — unlock on user gesture, short beep on trigger.
 */

export class SoundChannel {
  constructor() {
    /** @type {AudioContext | null} */ this.ctx = null;
    this.unlocked = false;
  }

  /** Call from a user gesture (Start / test button). */
  async unlock() {
    if (this.unlocked && this.ctx?.state === 'running') return;
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.unlocked = this.ctx.state === 'running';
  }

  isUnlocked() {
    return this.unlocked && this.ctx?.state === 'running';
  }

  /**
   * @param {number} volume 0–1
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
}
