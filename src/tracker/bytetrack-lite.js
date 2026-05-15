/**
 * ByteTrack-Lite — IoU association + EMA box smoothing.
 *
 * Why "Lite":
 *   The original ByteTrack (Zhang et al., 2022) does a two-stage Hungarian
 *   association with a Kalman filter and uses both high- and low-confidence
 *   detections. We strip it down to:
 *
 *     1. Greedy IoU matching (sufficient for <~20 boxes per frame).
 *     2. EMA smoothing on matched track bboxes — this is what visually kills
 *        the per-frame jitter that vanilla per-frame detection produces.
 *     3. Track aging with `maxMissed` frames before deletion, and a small
 *        warmup `minHits` before a track is considered "confirmed".
 *
 * The simplification is intentional and matches the project plan: get a stable
 * bbox first, upgrade to Kalman / two-stage matching only if jitter still
 * exceeds the user's tolerance.
 *
 * Coordinate space: tracker is unit-agnostic. Pass detections in pixel coords
 * of the source frame; tracks come back in the same space.
 */

/**
 * @typedef {import('../detector/yolo.js').Detection} Detection
 * @typedef Track
 * @property {number} id
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} score      // EMA-smoothed score
 * @property {number} classId
 * @property {number} hits       // total frames this track has been matched
 * @property {number} missed     // consecutive frames without a match
 * @property {number} age        // total frames since first seen
 * @property {boolean} confirmed // hits >= minHits
 * @property {number} [lastFaceFrameIdx]  // app frame index of last Phase-2 face run (Step 5)
 * @property {import('../pipeline/face.js').Face[] | null} [lastFaces] // cached faces for throttled frames
 */

/**
 * @typedef TrackerOptions
 * @property {number} [iouThreshold=0.3]   // min IoU to associate det ↔ track
 * @property {number} [emaAlpha=0.5]       // 1.0 = no smoothing (use detection),
 *                                         // 0.0 = no update (frozen). 0.5 is
 *                                         // a standard starting point.
 * @property {number} [maxMissed=15]       // drop after this many missed frames
 * @property {number} [minHits=3]          // hits required before "confirmed"
 */

const DEFAULTS = {
  iouThreshold: 0.3,
  emaAlpha: 0.5,
  maxMissed: 15,
  minHits: 3,
};

export class ByteTrackLite {
  constructor(opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    /** @type {Track[]} */
    this.tracks = [];
    this._nextId = 1;
  }

  reset() {
    this.tracks = [];
    this._nextId = 1;
  }

  /**
   * Step the tracker forward by one frame.
   * @param {Detection[]} detections
   * @returns {Track[]} active tracks matched this frame (missed === 0).
   */
  update(detections) {
    const tracks = this.tracks;

    // 1. Build IoU matrix; greedily match in descending IoU.
    const pairs = [];
    for (let t = 0; t < tracks.length; t++) {
      for (let d = 0; d < detections.length; d++) {
        if (tracks[t].classId !== detections[d].classId) continue;
        const score = iou(tracks[t], detections[d]);
        if (score < this.opts.iouThreshold) continue;
        pairs.push({ t, d, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const trackMatched = new Uint8Array(tracks.length);
    const detMatched = new Uint8Array(detections.length);
    for (const p of pairs) {
      if (trackMatched[p.t] || detMatched[p.d]) continue;
      trackMatched[p.t] = 1;
      detMatched[p.d] = 1;
      this._emaUpdate(tracks[p.t], detections[p.d]);
    }

    // 2. Unmatched tracks: age them; drop if too old.
    const survivors = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (!trackMatched[i]) {
        t.missed += 1;
        t.age += 1;
        if (t.missed > this.opts.maxMissed) continue;
      }
      survivors.push(t);
    }

    // 3. Unmatched detections: birth new tracks.
    for (let i = 0; i < detections.length; i++) {
      if (detMatched[i]) continue;
      survivors.push(this._birth(detections[i]));
    }

    this.tracks = survivors;
    return survivors.filter((t) => t.missed === 0);
  }

  /**
   * @param {Track} t
   * @param {Detection} d
   */
  _emaUpdate(t, d) {
    const a = this.opts.emaAlpha;
    t.x1 = a * d.x1 + (1 - a) * t.x1;
    t.y1 = a * d.y1 + (1 - a) * t.y1;
    t.x2 = a * d.x2 + (1 - a) * t.x2;
    t.y2 = a * d.y2 + (1 - a) * t.y2;
    t.score = a * d.score + (1 - a) * t.score;
    t.hits += 1;
    t.missed = 0;
    t.age += 1;
    if (!t.confirmed && t.hits >= this.opts.minHits) t.confirmed = true;
  }

  /** @param {Detection} d */
  _birth(d) {
    return {
      id: this._nextId++,
      x1: d.x1,
      y1: d.y1,
      x2: d.x2,
      y2: d.y2,
      score: d.score,
      classId: d.classId,
      hits: 1,
      missed: 0,
      age: 1,
      confirmed: this.opts.minHits <= 1,
      lastFaceFrameIdx: -10_000_000,
      lastFaces: null,
    };
  }
}

function iou(a, b) {
  const xA = Math.max(a.x1, b.x1);
  const yA = Math.max(a.y1, b.y1);
  const xB = Math.min(a.x2, b.x2);
  const yB = Math.min(a.y2, b.y2);
  const inter = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (inter <= 0) return 0;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}
