# Argus

**Argus** is a browser-only, two-stage vision demo: **person detection** (Phase 1) then **face boxes inside each person ROI** (Phase 2). No Python, Docker, or GPU drivers—just a static page and a tiny static file server with cross-origin isolation headers for threaded WASM.

> 希臘神話裡永不闔眼的百眼巨人；在你看不到的地方，替你看著。

## Continuous integration

After you push to GitHub, **`.github/workflows/ci.yml`** runs `npm ci`, `npm run model:fetch`, and checks that ORT, Human, and YOLO artifacts exist. Replace branch filters if your default branch is not `main` / `master`.

## Features

- **Phase 1** — YOLO11n (ONNX) via `onnxruntime-web` (WebGPU → WASM), COCO class **person** only, **ByteTrack-Lite** (IoU + EMA) for stable boxes.
- **Phase 2** — [`@vladmandic/human`](https://github.com/vladmandic/human) **BlazeFace** path only, throttled per track, TF.js **`wasm`** backend (local binaries, no CDN).
- **Mirror-safe UI** — CSS mirrors the preview video; models consume the **unmirrored** frame; overlay compensates so boxes line up with what you see.
- **Offline-friendly** — Weights under `models/`, ORT + Human + TFJS WASM under `vendor/` (populated by `npm install` scripts).

## Requirements

- **Node.js** 20+ (repo targets **24** via `.nvmrc`).
- **Chromium-class browser** recommended for WebGPU; Safari/Firefox fall back to WASM where supported.

## Quick start

```bash
git clone <your-repo-url> argus && cd argus
nvm use                    # optional: Node 24 per .nvmrc
npm install                # vendors ORT + Human + TFJS wasm into vendor/
npm run model:fetch        # downloads models/yolo11n.onnx (see models/README.md)
npm run dev                # http://localhost:8765/
```

Open **`/`** for webcam. Static checks:

| Page | Purpose |
|------|---------|
| [`/tests/yolo.html`](tests/yolo.html) | One-shot YOLO preprocess → ORT → NMS on a dropped image |
| [`/tests/face.html`](tests/face.html) | Same **Phase 1 → Phase 2** path as `/` on a dropped image (`minHits: 1` so one frame can confirm) |

## Repository layout

```
argus/
  index.html              # Main UI
  server.mjs              # Static server + COOP/COEP/CORP (do not strip for WASM threads)
  package.json
  .nvmrc
  LICENSE                 # MIT — applies to this repo's source (not third-party weights)
  CONTRIBUTING.md
  .github/workflows/ci.yml
  src/
    app.js                 # rVFC/rAF loop, person + face pipelines, HUD
    detector/ort-loader.js, yolo.js
    tracker/bytetrack-lite.js
    pipeline/person.js, face.js
    ui/overlay.js
  scripts/
    vendor-ort.mjs        # Sync ORT web bundle → vendor/ort/
    vendor-human.mjs      # Stage Human ESM + BlazeFace + TFJS wasm → vendor/human/, models/human/
    fetch-model.mjs       # Download YOLO weights + SHA-256 verify
  tests/
    yolo.html, face.html   # Manual sanity pages
  models/                  # Large binaries gitignored; see models/README.md
  vendor/                  # Vendored runtimes gitignored; recreated by npm install
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start `server.mjs` on port **8765** (override with `PORT`). |
| `npm run vendor:ort` | Copy `onnxruntime-web` dist into `vendor/ort/`. |
| `npm run vendor:human` | Copy Human ESM, BlazeFace, TFJS wasm workers into `vendor/human/` and `models/human/`. |
| `npm run model:fetch` | Download default YOLO ONNX into `models/`. |

`postinstall` runs **`vendor:ort`** then **`vendor:human`**.

## Third-party licenses

| Component | License | Notes |
|-----------|---------|--------|
| This repository (TS/JS you see here) | **MIT** | [`LICENSE`](LICENSE) |
| Default YOLO11n ONNX weights | **AGPL-3.0** | See [`models/README.md`](models/README.md); swap weights if AGPL is a problem for you. |
| [`@vladmandic/human`](https://github.com/vladmandic/human) | **MIT** | BlazeFace weights vendored from the npm package. |
| [`onnxruntime-web`](https://github.com/microsoft/onnxruntime) | **MIT** | Vendored WASM/JS. |
| TensorFlow.js WASM backend | **Apache-2.0** | Vendored alongside Human. |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Disclaimer

This project is **personal / educational** quality—not a commercial analytics product. Use at your own risk; do not rely on it for safety-critical decisions.
