#!/usr/bin/env node
/**
 * Download Phase 1 detector weights from Hugging Face into models/.
 *
 * Default target: webnn/yolo11n -> onnx/yolo11n.onnx (fp32, COCO 80-class,
 * input 1x3x640x640, license AGPL-3.0). The .pt was exported to ONNX upstream
 * by the webnn team for browser inference; see https://huggingface.co/webnn/yolo11n.
 *
 * Why fp32 by default?
 *   - ORT-Web's WASM EP has limited fp16 op coverage, so a fp16 weight would
 *     break the Safari / no-WebGPU fallback path.
 *   - 10.7 MiB is acceptable for our budget; we can switch to fp16 once we
 *     commit to WebGPU-only.
 *
 * Verification: HF serves an LFS pointer whose `x-linked-etag` header is the
 * SHA-256 of the resolved file. We sha256 the downloaded bytes and compare.
 *
 * Idempotent: if the destination file already exists with the right size AND
 * sha256, we skip. Pass --force to re-download.
 *
 * Not wired to postinstall on purpose (a fresh `npm install` should not pull
 * ~10 MiB of weights silently). Run manually via `npm run model:fetch`.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Static manifest of supported weights. Extend this when adding YOLOX, etc.
const MODELS = {
  'yolo11n': {
    url: 'https://huggingface.co/webnn/yolo11n/resolve/main/onnx/yolo11n.onnx',
    dst: 'models/yolo11n.onnx',
    expectedSize: 10720228,
    // From `x-linked-etag` (LFS oid = sha256 of file content).
    expectedSha256: '7d8fd1717d9d5bbab6986cd134afb620649c7a394303d55b1e09fc00804cc5c1',
    notes: 'YOLO11n fp32, 1x3x640x640, COCO80. License: AGPL-3.0 (Ultralytics).',
  },
  'yolo11n-fp16': {
    url: 'https://huggingface.co/webnn/yolo11n/resolve/main/onnx/yolo11n_fp16.onnx',
    dst: 'models/yolo11n_fp16.onnx',
    expectedSize: 5404656,
    expectedSha256: '1a9c5f9db58e64e15e08d7fabffe233bbb80cd1bf08d406c89ff82c8fdce64ae',
    notes: 'YOLO11n fp16 (WebGPU only). License: AGPL-3.0.',
  },
};

function parseArgs(argv) {
  const opts = { name: 'yolo11n', force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force' || a === '-f') opts.force = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (!a.startsWith('-')) opts.name = a;
    else {
      console.error(`unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`fetch-model.mjs — download a Phase 1 ONNX weight to models/

Usage:
  node scripts/fetch-model.mjs [name] [--force] [--list]

Names:
${Object.entries(MODELS)
  .map(([k, v]) => `  ${k.padEnd(14)}  ${(v.expectedSize / 1024 / 1024).toFixed(1)} MiB  ${v.notes}`)
  .join('\n')}

  --force, -f   re-download even if the destination already verifies.
  --list        list available names and exit.
`);
}

async function sha256File(path) {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

function fmtMiB(n) {
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

async function downloadTo(url, tmpPath, expectedSize) {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} for ${url}`);
  }

  const contentLength = Number(resp.headers.get('content-length') || 0);
  if (contentLength && expectedSize && contentLength !== expectedSize) {
    console.warn(
      `[fetch-model] warn: content-length ${contentLength} != expected ${expectedSize} (continuing)`,
    );
  }

  const total = contentLength || expectedSize || 0;
  let received = 0;
  let lastPct = -1;
  const reportEvery = total ? Math.max(1, Math.floor(total / 20)) : 0;
  let lastReport = 0;

  const stream = Readable.fromWeb(resp.body);
  stream.on('data', (chunk) => {
    received += chunk.length;
    if (total && received - lastReport >= reportEvery) {
      lastReport = received;
      const pct = Math.floor((received / total) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        process.stdout.write(`\r  ${pct.toString().padStart(3)}%  ${fmtMiB(received)} / ${fmtMiB(total)}`);
      }
    }
  });

  await pipeline(stream, createWriteStream(tmpPath));
  process.stdout.write('\n');
  return received;
}

async function alreadyValid(dst, model) {
  try {
    const s = await stat(dst);
    if (s.size !== model.expectedSize) return false;
    const sha = await sha256File(dst);
    return sha === model.expectedSha256;
  } catch {
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.list) {
    for (const [k, v] of Object.entries(MODELS)) {
      console.log(`${k}\t${fmtMiB(v.expectedSize)}\t${v.url}`);
    }
    return;
  }

  const model = MODELS[opts.name];
  if (!model) {
    console.error(`unknown model "${opts.name}". try --list`);
    process.exit(2);
  }

  const dst = join(ROOT, model.dst);
  await mkdir(dirname(dst), { recursive: true });

  if (!opts.force && (await alreadyValid(dst, model))) {
    console.log(`[fetch-model] ${model.dst} already present and verified (${fmtMiB(model.expectedSize)})`);
    return;
  }

  const tmp = `${dst}.partial`;
  await rm(tmp, { force: true });
  console.log(`[fetch-model] downloading ${opts.name} -> ${model.dst}`);
  console.log(`              src: ${model.url}`);

  const received = await downloadTo(model.url, tmp, model.expectedSize);

  if (received !== model.expectedSize) {
    await rm(tmp, { force: true });
    throw new Error(`size mismatch: received ${received}, expected ${model.expectedSize}`);
  }
  const sha = await sha256File(tmp);
  if (sha !== model.expectedSha256) {
    await rm(tmp, { force: true });
    throw new Error(`sha256 mismatch:\n  got      ${sha}\n  expected ${model.expectedSha256}`);
  }

  await rename(tmp, dst);
  console.log(`[fetch-model] ok: ${model.dst}  ${fmtMiB(received)}  sha256=${sha.slice(0, 12)}…`);
}

main().catch((err) => {
  console.error('[fetch-model] failed:', err.message || err);
  process.exit(1);
});
