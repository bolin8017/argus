/**
 * YOLO11 ONNX inference wrapper.
 *
 * Conventions follow Ultralytics' export:
 *   - Input  "images"   : float32 [1, 3, 640, 640] in [0,1] (BGR? -> NO, RGB).
 *   - Output "output0"  : float32 [1, 84, 8400] where the 84 channels are
 *     [cx, cy, w, h, c0, c1, ..., c79]. Class probabilities are already
 *     sigmoid-applied during export, so we treat them as final scores.
 *   - Pixel coords are in the 640x640 letterboxed space and must be undone.
 *
 * Letterbox: scale the source frame to fit within 640x640 preserving aspect,
 * pad the remainder with gray 114 (Ultralytics default).
 *
 * This module is hot-path: we preallocate the input Float32Array and a
 * letterbox canvas so a steady-state inference triggers no large allocations.
 */

import { loadOrtSession } from './ort-loader.js';

const INPUT_SIZE = 640;
const PAD_GRAY = 114;
const COCO_PERSON_CLASS = 0;
const NUM_CLASSES = 80;
const NUM_OUTPUTS = 8400;
const INPUT_NAME = 'images';
const OUTPUT_NAME = 'output0';

/**
 * @typedef Detection
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} score
 * @property {number} classId
 */

/**
 * @typedef YoloOptions
 * @property {number} [confThreshold=0.25] // Ultralytics default
 * @property {number} [iouThreshold=0.45]  // Ultralytics default
 * @property {number} [maxDetections=100]
 * @property {number[]} [classFilter]      // keep only these class ids; undefined = keep all
 */

export class YoloDetector {
  /**
   * @param {string} modelUrl
   * @param {YoloOptions} [opts]
   */
  constructor(modelUrl, opts = {}) {
    this.modelUrl = modelUrl;
    this.conf = opts.confThreshold ?? 0.25;
    this.iou = opts.iouThreshold ?? 0.45;
    this.maxDet = opts.maxDetections ?? 100;
    this.classFilter = opts.classFilter ?? [COCO_PERSON_CLASS];

    /** @type {import('onnxruntime-web').InferenceSession | null} */
    this.session = null;
    this.ort = null;
    this.backend = null;

    // Reusable buffers (constructed lazily in init()).
    this._inputBuf = null; // Float32Array, length 1*3*640*640.
    this._lbCanvas = null; // canvas for letterbox.
    this._lbCtx = null;
  }

  async init() {
    const { ort, session, backend } = await loadOrtSession(this.modelUrl);
    this.ort = ort;
    this.session = session;
    this.backend = backend;

    this._inputBuf = new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE);

    // OffscreenCanvas where available (workers + main thread); fall back to
    // the DOM canvas on Safari < 16.4 etc.
    if (typeof OffscreenCanvas !== 'undefined') {
      this._lbCanvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
    } else {
      this._lbCanvas = document.createElement('canvas');
      this._lbCanvas.width = INPUT_SIZE;
      this._lbCanvas.height = INPUT_SIZE;
    }
    // willReadFrequently hints the 2D backing store to live on CPU so that
    // getImageData() does not stall on a GPU readback every frame.
    this._lbCtx = this._lbCanvas.getContext('2d', { willReadFrequently: true });
    return this;
  }

  /**
   * Run one inference on an HTMLVideoElement / HTMLImageElement / ImageBitmap.
   * The caller is responsible for ensuring the source has non-zero dimensions
   * (e.g. video readyState >= HAVE_CURRENT_DATA).
   *
   * @param {CanvasImageSource & { videoWidth?: number, videoHeight?: number, naturalWidth?: number, naturalHeight?: number, width?: number, height?: number }} source
   * @returns {Promise<{ detections: Detection[], detectMs: number }>}
   */
  async infer(source) {
    if (!this.session) throw new Error('YoloDetector.init() not awaited');

    const { srcW, srcH } = readSourceSize(source);
    if (!srcW || !srcH) {
      return { detections: [], detectMs: 0 };
    }

    const t0 = performance.now();

    const lb = this._letterbox(source, srcW, srcH);
    const tensor = new this.ort.Tensor('float32', this._inputBuf, [1, 3, INPUT_SIZE, INPUT_SIZE]);

    const results = await this.session.run({ [INPUT_NAME]: tensor });
    const out = results[OUTPUT_NAME] ?? Object.values(results)[0];
    const detections = this._postprocess(out.data, lb, srcW, srcH);

    const detectMs = performance.now() - t0;
    return { detections, detectMs };
  }

  /**
   * Draw `source` into the 640x640 input buffer with aspect-preserving
   * letterbox padding. Writes directly into `this._inputBuf` in CHW order.
   * @returns {{ scale: number, padX: number, padY: number }} undo parameters.
   */
  _letterbox(source, srcW, srcH) {
    const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH);
    const drawW = Math.round(srcW * scale);
    const drawH = Math.round(srcH * scale);
    const padX = Math.floor((INPUT_SIZE - drawW) / 2);
    const padY = Math.floor((INPUT_SIZE - drawH) / 2);

    const ctx = this._lbCtx;
    ctx.fillStyle = `rgb(${PAD_GRAY},${PAD_GRAY},${PAD_GRAY})`;
    ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    ctx.drawImage(source, padX, padY, drawW, drawH);

    const { data: rgba } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
    const plane = INPUT_SIZE * INPUT_SIZE;
    const buf = this._inputBuf;
    // RGBA HWC -> RGB CHW, normalized to [0,1].
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      buf[p] = rgba[i] / 255;                  // R
      buf[plane + p] = rgba[i + 1] / 255;      // G
      buf[2 * plane + p] = rgba[i + 2] / 255;  // B
    }

    return { scale, padX, padY };
  }

  /**
   * Decode raw [1, 84, 8400] output → array of Detections in source coords.
   * @param {Float32Array} data
   * @param {{ scale: number, padX: number, padY: number }} lb
   */
  _postprocess(data, lb, srcW, srcH) {
    // Column-major access into [84, 8400]: stride between channels = NUM_OUTPUTS.
    const stride = NUM_OUTPUTS;
    const wantClass = this.classFilter
      ? new Set(this.classFilter)
      : null;
    const candidates = [];

    for (let i = 0; i < NUM_OUTPUTS; i++) {
      // Pick the best class for this anchor; allows multi-class even if we
      // later widen classFilter beyond [person].
      let bestScore = 0;
      let bestClass = -1;
      for (let c = 0; c < NUM_CLASSES; c++) {
        const s = data[(4 + c) * stride + i];
        if (s > bestScore) {
          bestScore = s;
          bestClass = c;
        }
      }
      if (bestScore < this.conf) continue;
      if (wantClass && !wantClass.has(bestClass)) continue;

      const cx = data[0 * stride + i];
      const cy = data[1 * stride + i];
      const w = data[2 * stride + i];
      const h = data[3 * stride + i];

      // 640-space xyxy → original source coords.
      const x1 = (cx - w / 2 - lb.padX) / lb.scale;
      const y1 = (cy - h / 2 - lb.padY) / lb.scale;
      const x2 = (cx + w / 2 - lb.padX) / lb.scale;
      const y2 = (cy + h / 2 - lb.padY) / lb.scale;

      candidates.push({
        x1: clamp(x1, 0, srcW),
        y1: clamp(y1, 0, srcH),
        x2: clamp(x2, 0, srcW),
        y2: clamp(y2, 0, srcH),
        score: bestScore,
        classId: bestClass,
      });
    }

    return nmsClassAware(candidates, this.iou, this.maxDet);
  }
}

function readSourceSize(source) {
  const srcW = source.videoWidth ?? source.naturalWidth ?? source.width ?? 0;
  const srcH = source.videoHeight ?? source.naturalHeight ?? source.height ?? 0;
  return { srcW, srcH };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Class-aware NMS: detections in the same class suppress each other; cross
 * classes are independent. This matches the behaviour of `torchvision.ops.nms`
 * applied per-class, which is what `ultralytics.utils.ops.non_max_suppression`
 * does by default.
 * @param {Detection[]} dets
 */
function nmsClassAware(dets, iouThreshold, maxOut) {
  dets.sort((a, b) => b.score - a.score);
  const keep = [];
  const suppressed = new Uint8Array(dets.length);
  for (let i = 0; i < dets.length && keep.length < maxOut; i++) {
    if (suppressed[i]) continue;
    const a = dets[i];
    keep.push(a);
    for (let j = i + 1; j < dets.length; j++) {
      if (suppressed[j]) continue;
      const b = dets[j];
      if (b.classId !== a.classId) continue;
      if (iou(a, b) > iouThreshold) suppressed[j] = 1;
    }
  }
  return keep;
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

export { iou };
