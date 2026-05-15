#!/usr/bin/env node
/**
 * Assert vendored ORT / Human / TFJS wasm and default YOLO weights exist.
 * Used locally and in CI so checks stay in one place (see docs/UPGRADING.md).
 * Optional argument: subdirectory under repo root (e.g. `dist` for Cloudflare Pages).
 */

import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REL_BASE = process.argv[2];
const ROOT = REL_BASE ? resolve(REPO_ROOT, REL_BASE) : REPO_ROOT;

/** Paths relative to the tree being verified (repo root, or `dist/` for Pages). */
const REQUIRED = [
  'vendor/ort/ort.webgpu.bundle.min.mjs',
  'vendor/ort/ort-wasm-simd-threaded.asyncify.wasm',
  'vendor/human/human.esm.js',
  'vendor/human/tfjs-wasm/tfjs-backend-wasm.wasm',
  'models/human/blazeface.json',
  'models/human/blazeface.bin',
  'models/yolo11n.onnx',
];

async function main() {
  const missing = [];
  for (const rel of REQUIRED) {
    const abs = join(ROOT, rel);
    try {
      const s = await stat(abs);
      if (!s.isFile()) missing.push(`${rel} (not a file)`);
    } catch {
      missing.push(rel);
    }
  }

  if (missing.length) {
    console.error('[verify-vendor] missing or invalid paths:\n  - ' + missing.join('\n  - '));
    console.error(
      '\nHint: npm ci && npm run vendor:ort && npm run vendor:human && npm run model:fetch && npm run build\n' +
        '       (for dist/: npm run build && npm run verify:pages)',
    );
    process.exit(1);
  }

  console.log(`[verify-vendor] ok (${REQUIRED.length} paths${REL_BASE ? ` in ${REL_BASE}` : ''})`);
}

main().catch((err) => {
  console.error('[verify-vendor] failed:', err);
  process.exit(1);
});
