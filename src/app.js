/**
 * Argus entry point.
 *
 * Responsibilities:
 *   - Wire up the start button → getUserMedia → PersonPipeline → Overlay.
 *   - Drive the main loop with requestVideoFrameCallback (rVFC) when available,
 *     falling back to requestAnimationFrame on Firefox < 132. rVFC is the
 *     "right" hook for ML-on-video because it fires exactly once per presented
 *     video frame, never duplicating work nor starving on tab throttling.
 *   - Skip frames when the previous inference is still in flight, so we never
 *     build a backpressure queue when the GPU is saturated.
 *   - Update HUD (FPS, detectMs, active tracks, backend) from a 100 ms ticker.
 *
 * Mirror policy: the visible <video> is CSS-mirrored (transform: scaleX(-1)),
 * the model sees the original frame, and Overlay re-mirrors its draws so that
 * the boxes follow the human in the mirror. See ui/overlay.js for the math.
 */

import { PersonPipeline } from './pipeline/person.js';
import { FacePipeline } from './pipeline/face.js';
import { Overlay, EMA } from './ui/overlay.js';

const els = {
  video: /** @type {HTMLVideoElement} */ (document.getElementById('video')),
  canvas: /** @type {HTMLCanvasElement} */ (document.getElementById('overlay')),
  startBtn: /** @type {HTMLButtonElement} */ (document.getElementById('start')),
  stopBtn: /** @type {HTMLButtonElement} */ (document.getElementById('stop')),
  status: document.getElementById('status'),
  hud: {
    fps: document.getElementById('hud-fps'),
    detectMs: document.getElementById('hud-detect-ms'),
    tracks: document.getElementById('hud-tracks'),
    backend: document.getElementById('hud-backend'),
  },
};

const state = {
  /** @type {MediaStream | null} */ stream: null,
  /** @type {PersonPipeline | null} */ person: null,
  /** @type {FacePipeline | null} */ face: null,
  /** @type {Overlay | null} */ overlay: null,
  running: false,
  inflight: false,
  /** rVFC callback handle (browser-specific). */ rvfcHandle: 0,
  rafHandle: 0,
  /** @type {import('../src/tracker/bytetrack-lite.js').Track[]} */ lastTracks: [],
};

const ema = {
  fps: new EMA(0.1),
  detectMs: new EMA(0.1),
};
let lastFrameTime = 0;

function setStatus(text, tone = 'info') {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

async function start() {
  els.startBtn.disabled = true;
  setStatus('initializing model…');

  try {
    state.person = await new PersonPipeline().init();
    state.face = await new FacePipeline().init();
    if (els.hud.backend) els.hud.backend.textContent = state.person.backend;
  } catch (err) {
    console.error(err);
    setStatus(`model init failed: ${err.message ?? err}`, 'error');
    els.startBtn.disabled = false;
    return;
  }

  setStatus('requesting webcam…');
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // 720p is plenty for a 640-input detector and gives the user a
        // comfortable preview without choking weaker laptops.
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user',
      },
    });
  } catch (err) {
    console.error(err);
    setStatus(`webcam denied: ${err.message ?? err}`, 'error');
    els.startBtn.disabled = false;
    return;
  }

  els.video.srcObject = state.stream;
  await els.video.play();
  await onVideoReady();

  state.overlay = new Overlay(els.canvas, { mirrored: true });
  state.overlay.resizeTo(els.video.videoWidth, els.video.videoHeight);

  state.running = true;
  els.stopBtn.disabled = false;
  setStatus('running', 'good');

  schedule();
  startHudTicker();
}

function stop() {
  state.running = false;
  if (state.rvfcHandle && 'cancelVideoFrameCallback' in els.video) {
    /** @type {any} */ (els.video).cancelVideoFrameCallback(state.rvfcHandle);
  }
  if (state.rafHandle) cancelAnimationFrame(state.rafHandle);
  state.rvfcHandle = 0;
  state.rafHandle = 0;

  if (state.stream) {
    for (const t of state.stream.getTracks()) t.stop();
    state.stream = null;
  }
  els.video.srcObject = null;
  state.overlay?.clear();
  state.lastTracks = [];
  state.person?.reset();
  els.stopBtn.disabled = true;
  els.startBtn.disabled = false;
  setStatus('stopped');
}

function onVideoReady() {
  return new Promise((resolve) => {
    if (els.video.readyState >= 2 && els.video.videoWidth > 0) {
      resolve();
      return;
    }
    els.video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });
}

function schedule() {
  if (!state.running) return;
  if ('requestVideoFrameCallback' in els.video) {
    state.rvfcHandle = /** @type {any} */ (els.video).requestVideoFrameCallback(onFrame);
  } else {
    state.rafHandle = requestAnimationFrame(() => onFrame(performance.now()));
  }
}

async function onFrame(now /* , metadata */) {
  if (!state.running) return;

  const dt = lastFrameTime ? (now - lastFrameTime) : 0;
  lastFrameTime = now;
  if (dt > 0) ema.fps.push(1000 / dt);

  if (!state.inflight && state.person) {
    state.inflight = true;
    try {
      const { tracks, detectMs } = await state.person.detect(els.video);
      state.lastTracks = tracks;
      ema.detectMs.push(detectMs);
    } catch (err) {
      console.error('[app] detect failed:', err);
    } finally {
      state.inflight = false;
    }
  }

  state.overlay?.drawTracks(state.lastTracks);
  schedule();
}

let hudInterval = 0;
function startHudTicker() {
  clearInterval(hudInterval);
  hudInterval = setInterval(() => {
    if (els.hud.fps) {
      const v = ema.fps.value;
      els.hud.fps.textContent = v == null ? '—' : v.toFixed(1);
    }
    if (els.hud.detectMs) {
      const v = ema.detectMs.value;
      els.hud.detectMs.textContent = v == null ? '—' : v.toFixed(1);
    }
    if (els.hud.tracks) els.hud.tracks.textContent = String(state.lastTracks.length);
  }, 100);
}

els.startBtn?.addEventListener('click', () => {
  start().catch((err) => console.error('[app] start crashed:', err));
});
els.stopBtn?.addEventListener('click', () => stop());

// Surface unhandled rejections in the UI so testers don't have to open devtools.
window.addEventListener('unhandledrejection', (e) => {
  setStatus(`unhandled: ${e.reason?.message ?? e.reason}`, 'error');
});
