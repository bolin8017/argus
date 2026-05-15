#!/usr/bin/env node
/**
 * Stage @vladmandic/human browser bundle + BlazeFace weights + TFJS WASM
 * binaries under stable URLs for offline serving (no CDN).
 *
 *   vendor/human/human.esm.js     — browser ESM entry (bundled tfjs inside)
 *   models/human/*.json + *.bin   — BlazeFace detector only
 *   vendor/human/tfjs-wasm/*     — wasm + pthread workers for backend "wasm"
 *
 * Idempotent; safe to re-run after npm install.
 */

import { mkdir, copyFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HUMAN_PKG = join(ROOT, 'node_modules/@vladmandic/human');
const TFJS_WASM_PKG = join(ROOT, 'node_modules/@tensorflow/tfjs-backend-wasm');

const DST_HUMAN_JS = join(ROOT, 'vendor/human/human.esm.js');
const DST_MODELS = join(ROOT, 'models/human');
const DST_WASM = join(ROOT, 'vendor/human/tfjs-wasm');

const HUMAN_FILES = ['dist/human.esm.js'];
const MODEL_FILES = ['models/blazeface.json', 'models/blazeface.bin'];
async function copyRel(relFrom, toAbs) {
  const from = join(HUMAN_PKG, relFrom);
  const s = await stat(from);
  await mkdir(resolve(toAbs, '..'), { recursive: true });
  await copyFile(from, toAbs);
  return s.size;
}

async function ensureHumanPkg() {
  try {
    await stat(HUMAN_PKG);
  } catch {
    console.error(`[vendor-human] missing ${HUMAN_PKG}\n` + '            run "npm install" first.');
    process.exit(1);
  }
}

async function ensureTfjsWasmPkg() {
  try {
    await stat(TFJS_WASM_PKG);
  } catch {
    console.error(`[vendor-human] missing ${TFJS_WASM_PKG}\n` + '            add @tensorflow/tfjs-backend-wasm (see package.json).');
    process.exit(1);
  }
}

async function copyWasmOut() {
  const { readdir } = await import('node:fs/promises');
  const dir = join(TFJS_WASM_PKG, 'wasm-out');
  const names = await readdir(dir);
  const pick = names.filter((n) => n.endsWith('.wasm') || n.endsWith('.worker.js'));
  await mkdir(DST_WASM, { recursive: true });
  let bytes = 0;
  for (const n of pick) {
    const from = join(dir, n);
    const to = join(DST_WASM, n);
    const s = await stat(from);
    await copyFile(from, to);
    bytes += s.size;
    console.log(`  cp tfjs-wasm/${n}  (${(s.size / 1024).toFixed(1)} KiB)`);
  }
  return { count: pick.length, bytes };
}

async function main() {
  await ensureHumanPkg();
  await ensureTfjsWasmPkg();

  let total = 0;

  for (const rel of HUMAN_FILES) {
    const name = rel.split('/').pop();
    const to = join(ROOT, 'vendor/human', name);
    const sz = await copyRel(rel, to);
    total += sz;
    console.log(`  cp human/${name}  (${(sz / 1024).toFixed(1)} KiB)`);
  }

  await mkdir(DST_MODELS, { recursive: true });
  for (const rel of MODEL_FILES) {
    const name = rel.split('/').pop();
    const sz = await copyRel(rel, join(DST_MODELS, name));
    total += sz;
    console.log(`  cp models/human/${name}  (${(sz / 1024).toFixed(1)} KiB)`);
  }

  const { count, bytes } = await copyWasmOut();
  total += bytes;

  console.log(
    `[vendor-human] staged human.esm.js + BlazeFace (${MODEL_FILES.length} files) + ${count} tfjs wasm/worker files (~${(total / 1024 / 1024).toFixed(1)} MiB total)`,
  );
}

main().catch((err) => {
  console.error('[vendor-human] failed:', err);
  process.exit(1);
});
