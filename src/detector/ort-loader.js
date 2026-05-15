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

  // We surface the FIRST EP's failure in the thrown error rather than the
  // last, because ORT internally caches initialization failures: a failed
  // WebGPU attempt that needs the WASM module under the hood will poison the
  // wasm backend and make every subsequent EP attempt throw "previous call to
  // 'initWasm()' failed". The first error is the original root cause.
  /** @type {Array<{ ep: string, err: Error }>} */
  const failures = [];
  // eslint-disable-next-line no-console
  console.info(`[ort-loader] env crossOriginIsolated=${typeof globalThis !== 'undefined' && /** @type {any} */ (globalThis).crossOriginIsolated}, SharedArrayBuffer=${typeof SharedArrayBuffer !== 'undefined'}, numThreads=${ort.env.wasm.numThreads}, wasmPaths=${typeof ort.env.wasm.wasmPaths === 'string' ? ort.env.wasm.wasmPaths : '[object]'}`);
  // eslint-disable-next-line no-console
  console.info(`[ort-loader] EP order: ${order.join(' -> ')}`);
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
      const wrapped = err instanceof Error ? err : new Error(String(err));
      failures.push({ ep, err: wrapped });
      // eslint-disable-next-line no-console
      console.error(`[ort-loader] backend=${ep} failed:\n  message: ${wrapped.message}\n  stack:`, wrapped.stack ?? '(no stack)');
    }
  }
  // Throw with the FIRST failure's original message + a tail listing what we
  // tried, so the UI surfaces the root cause instead of the cached one.
  const first = failures[0];
  const summary = failures.map((f) => `${f.ep}=${f.err.message}`).join(' | ');
  const out = new Error(`all backends failed (${summary})`);
  out.cause = first?.err;
  throw out;
}

async function pickBackendOrder(preferred) {
  if (preferred === 'wasm') return ['wasm'];
  if (preferred === 'webgpu') return ['webgpu', 'wasm'];
  // Auto: probe first so we skip a doomed WebGPU import attempt on Safari/etc.
  const hasGPU = await probeWebGPU();
  return hasGPU ? ['webgpu', 'wasm'] : ['wasm'];
}
