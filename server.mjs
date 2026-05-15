/**
 * Argus dev server.
 *
 * Serves the current folder as static files and adds the Cross-Origin Isolation
 * headers that onnxruntime-web's threaded WASM build (and SharedArrayBuffer in
 * general) require. `npx serve` does not set these by default.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 8765;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const joined = normalize(join(ROOT, decoded));
  if (!joined.startsWith(ROOT)) return null;
  return joined;
}

async function handleRequest(req, res) {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');

  const filePath = safeJoin(req.url || '/');
  if (!filePath) {
    res.writeHead(400).end('bad path');
    return;
  }

  try {
    let target = filePath;
    const s = await stat(filePath);
    if (s.isDirectory()) target = join(filePath, 'index.html');
    const data = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(err.code || 'error');
  }
}

const MAX_PORT_TRIES = 10;

function listen(port, attempt = 0) {
  const server = createServer(handleRequest);
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_TRIES - 1) {
      console.warn(`[dev] port ${port} in use, trying ${port + 1}…`);
      listen(port + 1, attempt + 1);
      return;
    }
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[dev] ports ${PORT}–${port} are in use. Stop the other process, e.g.\n` +
          `      lsof -i :${PORT}   then kill <pid>\n` +
          `      or: PORT=${port + 1} npm run dev`,
      );
    } else {
      console.error('[dev] server error:', err);
    }
    process.exit(1);
  });
  server.listen(port, () => {
    if (port !== PORT) {
      console.warn(`[dev] default port ${PORT} was busy; using ${port} instead.`);
    }
    console.log(`Argus dev server: http://localhost:${port}`);
  });
}

listen(PORT);
