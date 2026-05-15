#!/usr/bin/env node
/**
 * Copy onnxruntime-web runtime files (.wasm + .mjs) from node_modules/ into
 * vendor/ort/ so the dev server can serve them with our COOP/COEP headers.
 *
 * Why a copy instead of importing from node_modules directly?
 *   1. Production hosting usually does not ship node_modules/.
 *   2. We want the runtime to live at a stable, public URL (/vendor/ort/...).
 *   3. ORT's WASM loader resolves sibling .wasm by URL, so the .mjs and the
 *      matching .wasm must end up in the same directory.
 *
 * Idempotent: re-running overwrites with the latest copy from node_modules.
 * Wired up in package.json as `npm run vendor:ort` and as `postinstall`.
 */

import { mkdir, copyFile, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = join(ROOT, 'node_modules/onnxruntime-web/dist');
const DST = join(ROOT, 'vendor/ort');

// Files the browser will request at runtime. Keep this list explicit so we
// never accidentally ship the entire dist (which includes node-only builds,
// debug builds, etc.). If onnxruntime-web renames a file in a future release,
// the warning below will flag it.
//
// ORT 1.26 bundle / wasm pairing (see onnxruntime-common/.../env.d.ts):
//   - ort.bundle.min.mjs            -> ort-wasm-simd-threaded.{mjs,wasm}        (plain CPU build)
//   - ort.webgpu.bundle.min.mjs     -> ort-wasm-simd-threaded.asyncify.{mjs,wasm}  (WebGPU + asyncify)
//   - ort.jspi.bundle.min.mjs       -> ort-wasm-simd-threaded.jspi.{mjs,wasm}      (WebGPU + JSPI)
//   - (any bundle, JSEP support)    -> ort-wasm-simd-threaded.jsep.{mjs,wasm}      (legacy webgpu/webnn ops)
//
// We use the webgpu bundle, so the only runtime-required pair is asyncify.
// We keep the plain `.wasm/.mjs` too because some ORT entry points fall back
// to those for the "wasm" EP path in a single-threaded context.
//
// We do NOT copy ort-wasm-simd-threaded.jsep.{mjs,wasm}: they are unused by
// ORT 1.26's webgpu bundle, and jsep.wasm exceeds Cloudflare Pages' per-file
// 25 MiB upload limit (see docs/DEPLOY.md).
const FILES = [
  // Main JS bundle (webgpu-aware loader).
  'ort.webgpu.bundle.min.mjs',
  'ort.webgpu.bundle.min.mjs.map',
  // Asyncify WASM pair — REQUIRED by the webgpu bundle in ORT 1.26.
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  // Plain WASM pair — used by the bundle for some non-webgpu code paths.
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
];

// Dropped from vendor list (Pages 25 MiB cap); remove stale copies if present.
const REMOVED = ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs'];

async function ensureSrc() {
  try {
    await stat(SRC);
  } catch {
    console.error(
      `[vendor-ort] missing ${SRC}\n` +
        '            run "npm install" first (onnxruntime-web is not installed).',
    );
    process.exit(1);
  }
}

async function main() {
  await ensureSrc();
  await mkdir(DST, { recursive: true });

  for (const name of REMOVED) {
    try {
      await unlink(join(DST, name));
      console.log(`  rm ${name} (removed from vendor set)`);
    } catch {
      /* already absent */
    }
  }

  let copied = 0;
  let bytes = 0;
  for (const name of FILES) {
    const from = join(SRC, name);
    const to = join(DST, name);
    try {
      const s = await stat(from);
      await copyFile(from, to);
      copied += 1;
      bytes += s.size;
      console.log(`  cp ${name}  (${(s.size / 1024).toFixed(1)} KiB)`);
    } catch (err) {
      console.warn(`  skip ${name}: ${err.code || err.message}`);
    }
  }

  const mib = (bytes / 1024 / 1024).toFixed(1);
  console.log(`[vendor-ort] copied ${copied}/${FILES.length} files (~${mib} MiB) -> vendor/ort/`);
}

main().catch((err) => {
  console.error('[vendor-ort] failed:', err);
  process.exit(1);
});
