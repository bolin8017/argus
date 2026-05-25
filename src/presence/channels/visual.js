/**
 * In-page visual presence indicator — lamp + optional stage emphasis.
 */

export class VisualChannel {
  /**
   * @param {{ stage?: HTMLElement | null, lamp?: HTMLElement | null }} els
   */
  constructor(els = {}) {
    this.stage = els.stage ?? null;
    this.lamp = els.lamp ?? null;
    this._level = 'none';
  }

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

  clear() {
    this.setState('none', '無人');
  }
}
