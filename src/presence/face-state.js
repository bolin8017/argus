/**
 * Face alert state - records fresh face detector samples per person track.
 */

export class FacePresenceState {
  constructor() {
    /** @type {Map<number, number[]>} */
    this.samplesByTrackId = new Map();
  }

  reset() {
    this.samplesByTrackId.clear();
  }

  /**
   * @param {Array<{ trackId: number, fresh?: boolean }>} faces
   * @param {Set<number>} qualifyingTrackIds
   * @param {{ faceWindowMs: number, faceHits: number }} settings
   * @param {number} nowMs
   * @param {boolean} [personThresholdMet=true] when false, keep pruning but do not record or qualify face alerts
   * @returns {{ present: boolean }}
   */
  tick(faces, qualifyingTrackIds, settings, nowMs, personThresholdMet = true) {
    const windowStart = nowMs - settings.faceWindowMs;

    for (const [trackId, samples] of this.samplesByTrackId) {
      const freshSamples = samples.filter((sampleMs) => sampleMs >= windowStart);
      if (freshSamples.length && qualifyingTrackIds.has(trackId)) {
        this.samplesByTrackId.set(trackId, freshSamples);
      } else {
        this.samplesByTrackId.delete(trackId);
      }
    }

    if (personThresholdMet) {
      const recordedTrackIds = new Set();
      for (const face of faces) {
        if (!face.fresh) continue;
        if (!qualifyingTrackIds.has(face.trackId)) continue;
        if (recordedTrackIds.has(face.trackId)) continue;
        recordedTrackIds.add(face.trackId);
        const samples = this.samplesByTrackId.get(face.trackId) ?? [];
        samples.push(nowMs);
        this.samplesByTrackId.set(face.trackId, samples);
      }

      for (const trackId of qualifyingTrackIds) {
        const samples = this.samplesByTrackId.get(trackId) ?? [];
        if (samples.length >= settings.faceHits) {
          return { present: true };
        }
      }
    }

    return { present: false };
  }

  /**
   * @param {Set<number>} qualifyingTrackIds
   * @param {{ faceWindowMs: number }} settings
   * @param {number} nowMs
   */
  hasRecentSamples(qualifyingTrackIds, settings, nowMs, personThresholdMet = true) {
    if (!personThresholdMet) return false;
    const windowStart = nowMs - settings.faceWindowMs;
    for (const trackId of qualifyingTrackIds) {
      const samples = this.samplesByTrackId.get(trackId) ?? [];
      if (samples.some((sampleMs) => sampleMs >= windowStart)) return true;
    }
    return false;
  }
}
