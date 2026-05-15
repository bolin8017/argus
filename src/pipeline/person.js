/**
 * Phase 1 pipeline: turn raw video frames into a stable list of person tracks.
 *
 * Composition only; algorithmic decisions live in:
 *   - src/detector/yolo.js   (preprocessing, inference, NMS)
 *   - src/tracker/bytetrack-lite.js (IoU association, EMA smoothing)
 *
 * Public surface is intentionally small so Step 5 can consume tracks without
 * caring how they were produced.
 */

import { YoloDetector } from '../detector/yolo.js';
import { ByteTrackLite } from '../tracker/bytetrack-lite.js';

const COCO_PERSON_CLASS = 0;

export class PersonPipeline {
  /**
   * @param {object} [opts]
   * @param {string} [opts.modelUrl]
   * @param {import('../detector/yolo.js').YoloOptions} [opts.detector]
   * @param {ConstructorParameters<typeof ByteTrackLite>[0]} [opts.tracker]
   */
  constructor(opts = {}) {
    this.modelUrl = opts.modelUrl ?? '/models/yolo11n.onnx';
    this.detector = new YoloDetector(this.modelUrl, {
      classFilter: [COCO_PERSON_CLASS],
      ...opts.detector,
    });
    this.tracker = new ByteTrackLite(opts.tracker);
  }

  async init() {
    await this.detector.init();
    return this;
  }

  get backend() {
    return this.detector.backend;
  }

  reset() {
    this.tracker.reset();
  }

  /**
   * @param {CanvasImageSource} source
   * @returns {Promise<{ tracks: import('../tracker/bytetrack-lite.js').Track[], detectMs: number, rawCount: number }>}
   */
  async detect(source) {
    const { detections, detectMs } = await this.detector.infer(source);
    const tracks = this.tracker.update(detections);
    return { tracks, detectMs, rawCount: detections.length };
  }
}
