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
    this._present = false;
  }

  /** @param {boolean} present */
  setPresent(present) {
    if (this._present === present) return;
    this._present = present;
    if (this.stage) {
      this.stage.classList.toggle('presence-present', present);
    }
    if (this.lamp) {
      this.lamp.dataset.state = present ? 'present' : 'absent';
      this.lamp.setAttribute('aria-label', present ? '有人' : '無人');
    }
  }

  clear() {
    this.setPresent(false);
  }
}
