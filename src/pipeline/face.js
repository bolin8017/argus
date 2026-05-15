/**
 * Phase 2 stub: face detection inside each person track's ROI.
 *
 * This file is intentionally empty of inference logic for Step 4. We expose
 * the eventual public shape so the rest of the app can call into it today and
 * be wired to a real engine (@vladmandic/human, mediapipe-face, etc.) in
 * Step 5 without UI changes.
 *
 * Coordinate-space contract for the future implementation:
 *   - Input: a Track (in source-frame pixel coords) + the raw video.
 *   - The implementation must crop the ROI from the *unmirrored* source,
 *     run face detection in ROI space, and translate face boxes back into
 *     source-frame coords by adding the track's (x1, y1) offset before
 *     returning.
 */

/**
 * @typedef Face
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} score
 * @property {number} trackId   // which person track this face was found inside
 */

export class FacePipeline {
  // eslint-disable-next-line no-unused-vars
  constructor(opts = {}) {
    this.ready = false;
  }

  async init() {
    this.ready = true;
    return this;
  }

  /**
   * @param {CanvasImageSource} _source
   * @param {import('../tracker/bytetrack-lite.js').Track[]} _tracks
   * @returns {Promise<Face[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async detect(_source, _tracks) {
    return [];
  }
}
