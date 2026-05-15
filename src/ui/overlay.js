/**
 * Overlay renderer — draws tracks (and later, faces) on top of the video.
 *
 * Mirror handling:
 *   The page may CSS-mirror the visible video for self-view feel
 *   (transform: scaleX(-1)), but the detector always runs on the raw,
 *   un-mirrored frame. So box coordinates we receive are in raw-video space.
 *   To draw them aligned with the visible mirrored video, we apply the same
 *   horizontal flip on the canvas ctx and let the boxes fall into place.
 *   The label text we draw with a counter-flip so it remains readable.
 */

const TRACK_COLORS = [
  '#22d3ee', '#a78bfa', '#f472b6', '#facc15',
  '#34d399', '#fb923c', '#60a5fa', '#f87171',
];

export class Overlay {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ mirrored?: boolean }} [opts]
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mirrored = opts.mirrored ?? false;
  }

  /**
   * Match the canvas backing store to the video's intrinsic resolution.
   * Call this when the video metadata changes (e.g. webcam started).
   */
  resizeTo(width, height) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * @param {import('../tracker/bytetrack-lite.js').Track[]} tracks
   * @param {import('../pipeline/face.js').Face[]} [faces]
   */
  drawTracks(tracks, faces = []) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    this.clear();

    ctx.save();
    if (this.mirrored) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }

    ctx.lineWidth = Math.max(2, Math.round(W / 480));
    ctx.font = `${Math.max(12, Math.round(W / 60))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'top';

    for (const t of tracks) {
      const color = TRACK_COLORS[t.id % TRACK_COLORS.length];
      ctx.strokeStyle = color;
      const x = t.x1;
      const y = t.y1;
      const w = t.x2 - t.x1;
      const h = t.y2 - t.y1;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, w, h);

      const label = `#${t.id}  ${(t.score * 100).toFixed(0)}%`;
      const metrics = ctx.measureText(label);
      const padding = 4;
      const boxH = parseInt(ctx.font, 10) + padding * 2;
      const boxY = Math.max(0, y - boxH);

      ctx.fillStyle = color;
      ctx.fillRect(x, boxY, metrics.width + padding * 2, boxH);

      // Counter-flip the label so it reads left-to-right even on mirrored ctx.
      ctx.save();
      if (this.mirrored) {
        ctx.translate(x + metrics.width + padding * 2, boxY);
        ctx.scale(-1, 1);
        ctx.fillStyle = '#0f1115';
        ctx.fillText(label, padding, padding);
      } else {
        ctx.fillStyle = '#0f1115';
        ctx.fillText(label, x + padding, boxY + padding);
      }
      ctx.restore();
    }

    this._drawFaces(ctx, faces);

    ctx.restore();
  }

  /**
   * Face boxes in raw-video space (same as tracks). Dashed outline to distinguish from person tracks.
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('../pipeline/face.js').Face[]} faces
   */
  _drawFaces(ctx, faces) {
    if (!faces.length) return;
    const dash = Math.max(4, Math.round(ctx.lineWidth * 2));
    ctx.setLineDash([dash, dash]);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = Math.max(2, ctx.lineWidth - 0.5);
    for (const f of faces) {
      const w = f.x2 - f.x1;
      const h = f.y2 - f.y1;
      ctx.strokeRect(f.x1, f.y1, w, h);
      const label = `face ${(f.score * 100).toFixed(0)}%`;
      const metrics = ctx.measureText(label);
      const padding = 4;
      const boxH = parseInt(ctx.font, 10) + padding * 2;
      const boxY = Math.max(0, f.y1 - boxH);
      ctx.fillStyle = 'rgba(52,211,153,0.85)';
      ctx.fillRect(f.x1, boxY, metrics.width + padding * 2, boxH);
      ctx.save();
      if (this.mirrored) {
        ctx.translate(f.x1 + metrics.width + padding * 2, boxY);
        ctx.scale(-1, 1);
        ctx.fillStyle = '#0f1115';
        ctx.fillText(label, padding, padding);
      } else {
        ctx.fillStyle = '#0f1115';
        ctx.fillText(label, f.x1 + padding, boxY + padding);
      }
      ctx.restore();
    }
    ctx.setLineDash([]);
  }
}

/**
 * Tiny exponential moving average for HUD numbers (FPS / detectMs).
 * Public so the app layer doesn't need its own implementation.
 */
export class EMA {
  constructor(alpha = 0.1) {
    this.alpha = alpha;
    this.value = null;
  }
  push(x) {
    this.value = this.value == null ? x : this.alpha * x + (1 - this.alpha) * this.value;
    return this.value;
  }
  reset() { this.value = null; }
}
