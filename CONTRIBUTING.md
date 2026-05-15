# Contributing

Argus is a small browser-only demo; contributions are welcome if they stay in scope.

## Before you send a PR

1. **Run the app locally** — `nvm use`, `npm ci` (or `npm install`), `npm run model:fetch`, `npm run verify:vendor`, `npm run dev`, then open `http://localhost:8765/`. For the same checks as CI (including the Cloudflare bundle), run `npm run build` and `npm run verify:pages`.
2. **Keep server headers intact** — do not weaken or remove `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` / `Cross-Origin-Resource-Policy` in `server.mjs` without a strong reason (threaded WASM depends on isolation).
3. **No server-side inference** — detection runs in the browser only.
4. **Offline assets** — avoid hard dependency on public CDNs for runtime; prefer `vendor/` and `models/`.

## Style

- UI copy may be Chinese; **source comments and identifiers stay in English**.
- Prefer small, focused changes over wide refactors.

## Bumping dependencies

See [`docs/UPGRADING.md`](docs/UPGRADING.md) for npm vs Hugging Face weight tracks, the maintainer checklist, and what to do when `onnxruntime-web` renames WASM files. Production deploys: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Legal

Bundled **YOLO11n** weights are **AGPL-3.0** (see `models/README.md`). If you redistribute binaries you ship, make sure your use complies with that license or swap the weights for an Apache-compatible model.
