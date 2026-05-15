/**
 * Phase 2: face detection inside each person track ROI using @vladmandic/human
 * (BlazeFace path only — other face modules disabled).
 *
 * Coordinate-space contract:
 *   - Input: tracks in source-frame pixel coords + raw (unmirrored) video / image.
 *   - Crop ROI from the unmirror source, run Human on the crop, then translate
 *     each face box [x,y,w,h] back with the integer crop origin (sx, sy).
 */

/**
 * @typedef Face
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {number} score
 * @property {number} trackId
 */

export class FacePipeline {
  /**
   * @param {object} [opts]
   * @param {string} [opts.humanModuleUrl='/vendor/human/human.esm.js'] Vendored Human ESM URL
   * @param {string} [opts.modelBasePath='/models/human/'] BlazeFace json+bin directory
   * @param {string} [opts.wasmPath='/vendor/human/tfjs-wasm/'] TFJS wasm + worker files
   */
  constructor(opts = {}) {
    this.humanModuleUrl = opts.humanModuleUrl ?? '/vendor/human/human.esm.js';
    this.modelBasePath = opts.modelBasePath ?? '/models/human/';
    this.wasmPath = opts.wasmPath ?? '/vendor/human/tfjs-wasm/';
    /** @type {any} */
    this.human = null;
    this.ready = false;
    /** @type {OffscreenCanvas | HTMLCanvasElement | null} */
    this._cropCanvas = null;
  }

  _humanConfig() {
    const base = this.modelBasePath.endsWith('/') ? this.modelBasePath : `${this.modelBasePath}/`;
    const wasm = this.wasmPath.endsWith('/') ? this.wasmPath : `${this.wasmPath}/`;
    return {
      backend: 'wasm',
      modelBasePath: base,
      wasmPath: wasm,
      wasmPlatformFetch: true,
      debug: false,
      warmup: 'none',
      async: false,
      cacheModels: true,
      validateModels: false,
      filter: { enabled: false },
      gesture: { enabled: false },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      segmentation: { enabled: false },
      face: {
        enabled: true,
        detector: {
          enabled: true,
          modelPath: 'blazeface.json',
          rotation: false,
          maxDetected: 15,
          skipFrames: 0,
          skipTime: 0,
          minConfidence: 0.2,
          minSize: 0,
          iouThreshold: 0.1,
          scale: 1.4,
          mask: false,
          return: false,
          square: true,
        },
        mesh: { enabled: false },
        iris: { enabled: false },
        attention: { enabled: false },
        emotion: { enabled: false },
        description: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
        gear: { enabled: false },
      },
    };
  }

  async init() {
    const { Human } = await import(/* @vite-ignore */ this.humanModuleUrl);
    this.human = new Human(this._humanConfig());
    await this.human.init();
    await this.human.load();
    this.ready = true;
    return this;
  }

  /**
   * @param {CanvasImageSource} source
   * @param {import('../tracker/bytetrack-lite.js').Track[]} tracks
   * @param {{ frameIdx?: number, fps?: number | null }} [ctx]
   * @returns {Promise<{ faces: Face[], faceMs: number }>}
   */
  async detect(source, tracks, ctx = {}) {
    const frameIdx = ctx.frameIdx ?? 0;
    const fpsVal = ctx.fps;
    const fps = typeof fpsVal === 'number' && fpsVal > 1 ? fpsVal : 30;
    const periodFrames = Math.max(5, Math.round(fps / 2));

    const vw =
      /** @type {any} */ (source).videoWidth ??
      /** @type {any} */ (source).width ??
      0;
    const vh =
      /** @type {any} */ (source).videoHeight ??
      /** @type {any} */ (source).height ??
      0;

    /** @type {Face[]} */
    const out = [];
    if (!this.human || !vw || !vh) {
      return { faces: out, faceMs: 0 };
    }

    const t0 = performance.now();

    for (const track of tracks) {
      const lastIdx = track.lastFaceFrameIdx ?? -10_000_000;
      const due = frameIdx - lastIdx >= periodFrames;
      if (!due) {
        if (track.lastFaces?.length) out.push(...track.lastFaces);
        continue;
      }

      const sx = Math.max(0, Math.floor(track.x1));
      const sy = Math.max(0, Math.floor(track.y1));
      const sw = Math.max(1, Math.min(Math.floor(track.x2) - sx, vw - sx));
      const sh = Math.max(1, Math.min(Math.floor(track.y2) - sy, vh - sy));

      const crop = await this._cropToCanvas(source, sx, sy, sw, sh);
      const result = await this.human.detect(crop);

      /** @type {Face[]} */
      const batch = [];
      const faces = result?.face;
      if (Array.isArray(faces)) {
        for (const f of faces) {
          const box = f.box;
          if (!box || box.length < 4) continue;
          const [bx, by, bw, bh] = box;
          batch.push({
            x1: bx + sx,
            y1: by + sy,
            x2: bx + bw + sx,
            y2: by + bh + sy,
            score: f.score ?? f.boxScore ?? 0,
            trackId: track.id,
          });
        }
      }
      track.lastFaceFrameIdx = frameIdx;
      track.lastFaces = batch;
      out.push(...batch);
    }

    return { faces: out, faceMs: performance.now() - t0 };
  }

  /**
   * @param {CanvasImageSource} source
   */
  async _cropToCanvas(source, sx, sy, sw, sh) {
    if (!this._cropCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this._cropCanvas = new OffscreenCanvas(sw, sh);
      } else {
        const c = document.createElement('canvas');
        this._cropCanvas = c;
      }
    }
    const c = this._cropCanvas;
    if (c.width !== sw || c.height !== sh) {
      c.width = sw;
      c.height = sh;
    }
    const ctx2 = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */ (
      c.getContext('2d')
    );
    ctx2.drawImage(/** @type {any} */ (source), sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  }
}
