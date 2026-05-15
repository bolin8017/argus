#!/usr/bin/env node
/**
 * Assemble Cloudflare Pages output under dist/ (no node_modules).
 * Run after npm install (vendor/*) and npm run model:fetch (models/*).
 */

import { cp, mkdir, rm, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');

const COPY_DIRS = ['src', 'tests', 'vendor', 'models'];
const COPY_FILES = ['index.html'];

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const name of COPY_FILES) {
    await copyFile(join(ROOT, name), join(DIST, name));
    console.log(`  + ${name}`);
  }
  for (const dir of COPY_DIRS) {
    const from = join(ROOT, dir);
    const to = join(DIST, dir);
    await cp(from, to, { recursive: true, force: true });
    console.log(`  + ${dir}/`);
  }

  await copyFile(join(PUBLIC, '_headers'), join(DIST, '_headers'));
  console.log('  + _headers (from public/)');

  console.log('[build-pages] ok -> dist/');
}

main().catch((err) => {
  console.error('[build-pages] failed:', err);
  process.exit(1);
});
