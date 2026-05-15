/**
 * onnxruntime-web initializer.
 *
 * Public API:
 *   const { ort, session, backend } = await loadOrtSession('/models/yolo11n.onnx');
 *
 * - `backend` is 'webgpu' or 'wasm' — the EP that actually got accepted.
 * - `ort` is the namespace export so callers can build tensors with
 *   `new ort.Tensor(...)` without re-importing it.
 *
 * Why this file exists:
 *   - We only want to dynamically import the ~110 KiB WebGPU bundle once.
 *   - We need to configure `ort.env.wasm.{wasmPaths,numThreads,simd}` BEFORE
 *     the first session is created, otherwise ORT picks defaults that point
 *     to a CDN we don't ship.
 *   - We want a deterministic fallback path (try WebGPU; on either no-WebGPU
 *     browser or session-creation failure, drop to threaded SIMD WASM) so the
 *     HUD can report a single, accurate backend name.
 */

const ORT_BUNDLE_URL = '/vendor/ort/ort.webgpu.bundle.min.mjs';

let _ortPromise = null;

/** Lazily import the onnxruntime-web ESM bundle exactly once per page. */
async function importOrt() {
  if (!_ortPromise) {
    _ortPromise = import(/* @vite-ignore */ ORT_BUNDLE_URL).then((mod) => {
      // The bundle exposes the namespace both as default and as named exports.
      // `import * as ort` returns the module record, which is what we want.
      const ort = mod.default ?? mod;
      configureOrt(ort);
      return ort;
    });
  }
  return _ortPromise;
}

/**
 * One-time configuration. Safe to call multiple times: setting the same value
 * twice is a no-op in ORT.
 */
function configureOrt(ort) {
  // Serve sibling .wasm/.mjs from our own origin so we work fully offline and
  // so the Cross-Origin Isolation guarantees from server.mjs still hold.
  ort.env.wasm.wasmPaths = '/vendor/ort/';

  // Threaded WASM SIMD: ORT will refuse to enable threads unless the page is
  // cross-origin-isolated (we set COOP/COEP/CORP in server.mjs). Cap to 8 to
  // avoid pathological scheduling on machines with very many cores.
  const cores = (globalThis.navigator?.hardwareConcurrency ?? 4);
  ort.env.wasm.numThreads = Math.min(Math.max(2, cores - 1), 8);
  ort.env.wasm.simd = true;

  // Quieter logs by default; flip to 'verbose' when debugging EP selection.
  ort.env.logLevel = 'warning';
}

/** Does this browser plausibly expose a usable WebGPU adapter? */
async function probeWebGPU() {
  const nav = globalThis.navigator;
  if (!nav?.gpu) return false;
  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
    return Boolean(adapter);
  } catch {
    return false;
  }
}

/**
 * Create an InferenceSession for the given .onnx URL, preferring WebGPU and
 * falling back to threaded WASM. Returns the namespace, the session, and the
 * backend label that the rest of the app should display.
 *
 * @param {string} modelUrl
 * @param {{ preferBackend?: 'webgpu' | 'wasm' }} [opts]
 */
export async function loadOrtSession(modelUrl, opts = {}) {
  const ort = await importOrt();
  const order = (await pickBackendOrder(opts.preferBackend));

  const sessionOptions = {
    graphOptimizationLevel: 'all',
    // ORT picks executionMode internally based on EP, but being explicit here
    // means a future ORT release that changes defaults won't silently regress.
    executionMode: 'sequential',
  };

  let lastErr;
  for (const ep of order) {
    try {
      const t0 = performance.now();
      const session = await ort.InferenceSession.create(modelUrl, {
        ...sessionOptions,
        executionProviders: [ep],
      });
      const loadMs = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.info(`[ort-loader] backend=${ep} load=${loadMs.toFixed(0)}ms`);
      return { ort, session, backend: ep };
    } catch (err) {
      lastErr = err;
      // eslint-disable-next-line no-console
      console.warn(`[ort-loader] backend=${ep} failed:`, err?.message || err);
    }
  }
  throw lastErr ?? new Error('No execution provider succeeded.');
}

async function pickBackendOrder(preferred) {
  if (preferred === 'wasm') return ['wasm'];
  if (preferred === 'webgpu') return ['webgpu', 'wasm'];
  // Auto: probe first so we skip a doomed WebGPU import attempt on Safari/etc.
  const hasGPU = await probeWebGPU();
  return hasGPU ? ['webgpu', 'wasm'] : ['wasm'];
}
