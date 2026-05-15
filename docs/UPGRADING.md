# Upgrading dependencies and assets

This project vendors browser runtimes under `vendor/` and downloads YOLO weights into `models/`. Reproducible installs use **`npm ci`** and the committed **`package-lock.json`**.

## What moves on its own

| Track | Source | Locked by |
|-------|--------|-----------|
| onnxruntime-web, Human, TFJS WASM | npm | `package.json` + `package-lock.json` → `postinstall` copies into `vendor/` |
| Default YOLO11n ONNX | Hugging Face (`webnn/yolo11n`) | `scripts/fetch-model.mjs` (URL, size, SHA-256) — **not** npm |

[Dependabot](https://docs.github.com/en/code-security/dependabot) opens PRs for npm and GitHub Actions updates on a schedule defined in `.github/dependabot.yml`. If no PRs appear after merging that file, enable **Dependabot version updates** under the repository **Settings → Code security and analysis** (organization policy can also gate this).

## Maintainer checklist (every npm bump PR)

1. `npm ci`
2. `npm run build` (runs `model:fetch` and assembles `dist/`)
3. `npm run verify:pages`
4. Watch **`npm run vendor:ort`** output when you reinstall: if `onnxruntime-web` renames WASM/JS files, update the allowlist in `scripts/vendor-ort.mjs` and adjust `src/detector/ort-loader.js` if the bundle URL changes.
5. Manual smoke (Chromium-class browser): `/`, `/tests/yolo.html`, `/tests/face.html` — with and without WebGPU if you can (locally via `npm run dev`, or against `dist/` via `npx wrangler pages dev dist`).
6. Do **not** weaken `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` / `Cross-Origin-Resource-Policy` in `server.mjs` or **`public/_headers`** without a documented reason (threaded WASM depends on cross-origin isolation).

## When Hugging Face weights change

If the blob at the resolved URL changes (new export, LFS update), `npm run model:fetch` will fail with a size or SHA-256 mismatch.

1. Run `npm run model:fetch -- --force` after updating `scripts/fetch-model.mjs` with new `expectedSize` and `expectedSha256` (and URL if needed), **or** use the error output’s “got” hash to update the manifest.
2. Update `models/README.md` if the license or upstream attribution changed.

## Cloudflare Pages bundle

Production hosting copies only static files into `dist/` (see `scripts/build-pages.mjs`). After dependency or vendor script changes, run:

```bash
npm run build
npm run verify:pages
```

## Local commands (copy-paste)

```bash
npm ci
npm run model:fetch
npm run verify:vendor
npm run dev
```

For a **production-shaped** tree (same as CI / Pages):

```bash
npm ci
npm run build
npm run verify:pages
```

To re-stage vendors without a full reinstall:

```bash
npm run vendor:ort
npm run vendor:human
```

## CI

`.github/workflows/ci.yml` runs `npm ci`, **`npm run build`**, and **`npm run verify:pages`** on pushes and pull requests to `main` / `master`. Optional GitHub → Cloudflare deploy is documented in [`docs/DEPLOY.md`](docs/DEPLOY.md) (`CF_PAGES_ENABLE` and secrets).
