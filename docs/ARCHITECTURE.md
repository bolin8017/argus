# Argus Architecture

Argus is a browser-only, two-stage vision app. The production build is a static site: HTML, JavaScript modules, local model files, vendored browser runtimes, and cross-origin isolation headers.

## Pipeline

```text
webcam frame
  -> PersonPipeline
       YOLO11n ONNX
       ONNX Runtime Web
       WebGPU when available, threaded WASM fallback
  -> ByteTrack-lite
       IoU matching
       EMA-smoothed boxes
  -> FacePipeline
       Human / BlazeFace
       runs inside person ROIs
       throttles detection per track
  -> PresenceCoordinator
       person state
       face freshness window
       alert-level priority
  -> channels
       sound
       Web Notification
       visual lamp
```

The visible video is CSS-mirrored. Model input stays unmirrored, and the overlay mirrors its draw calls so bounding boxes match the user's view.

## Alert Model

The alert coordinator emits one highest-priority state per tick:

| Level | UI label | Meaning |
|-------|----------|---------|
| 0 | `無人` | No person meets the configured threshold. |
| 1 | `有人` | A qualifying person is present. |
| 2 | `偵測到臉` | A fresh face sample qualifies inside a person track. |

Face alerts use fresh detector samples, not cached boxes, so throttled face detection does not keep a stale face state alive forever.

## Runtime Assets

Argus avoids CDN runtime dependencies in production.

| Asset | Location | Source |
|-------|----------|--------|
| YOLO11n ONNX weights | `models/` | Downloaded by `npm run model:fetch` |
| ONNX Runtime Web bundle | `vendor/ort/` | Copied from `onnxruntime-web` |
| Human ESM bundle | `vendor/human/` | Copied from `@vladmandic/human` |
| BlazeFace model | `models/human/` | Copied from `@vladmandic/human` |
| TFJS WASM backend | `vendor/human/tfjs-wasm/` | Copied from TensorFlow.js dependencies |

`postinstall` runs `vendor:ort` and `vendor:human`, so `npm install` or `npm ci` recreates the vendored runtime tree.

## Repository Layout

```text
argus/
  index.html              # Main UI
  server.mjs              # Local static server with isolation headers
  public/_headers         # Cloudflare Pages COOP/COEP/CORP headers
  wrangler.toml           # Pages output directory and project name
  src/
    app.js                # rVFC/rAF loop, pipelines, HUD, presence tick
    detector/             # ORT loader and YOLO post-processing
    tracker/              # ByteTrack-lite implementation
    pipeline/             # Person and face pipelines
    presence/             # Alert settings, state, coordinator, channels
    ui/                   # Overlay and display settings
  scripts/
    fetch-model.mjs       # Download and verify YOLO weights
    vendor-ort.mjs        # Stage ONNX Runtime Web files
    vendor-human.mjs      # Stage Human, BlazeFace, and TFJS WASM files
    verify-vendor.mjs     # Verify required runtime/model files
    build-pages.mjs       # Assemble dist/ for Pages
  tests/
    *.test.js             # Node unit tests for alert logic
    yolo.html             # Manual YOLO smoke page
    face.html             # Manual person-to-face smoke page
  models/                 # Large model files, gitignored
  vendor/                 # Vendored runtime files, gitignored
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start the local server on port 8765. |
| `npm test` | Run Node unit tests for alert logic and channels. |
| `npm run model:fetch` | Download and verify the default YOLO ONNX model. |
| `npm run vendor:ort` | Copy ONNX Runtime Web files into `vendor/ort/`. |
| `npm run vendor:human` | Copy Human, BlazeFace, and TFJS WASM files. |
| `npm run verify:vendor` | Verify local `models/` and `vendor/` assets. |
| `npm run build` | Fetch model assets and assemble `dist/`. |
| `npm run verify:pages` | Verify the production-shaped `dist/` bundle. |

## CI and Deploy

`.github/workflows/ci.yml` runs on pushes and pull requests to `main` or `master`.

The verify job runs:

```bash
npm ci
npm run build
npm run verify:pages
```

When `CF_PAGES_ENABLE` is true on a `main` push, the workflow uploads `dist/` and deploys it to Cloudflare Pages. See [`DEPLOY.md`](DEPLOY.md) for setup.

## Browser Notes

- WebGPU-capable Chromium browsers should use the WebGPU path for person detection.
- Safari and Firefox fall back to WASM where supported.
- Threaded WASM requires cross-origin isolation, so `server.mjs` and `public/_headers` both set COOP/COEP/CORP headers.
- Camera, audio, and notification behavior can change when a tab is backgrounded, especially on mobile Safari.

## Third-Party Licenses

| Component | License | Notes |
|-----------|---------|-------|
| Argus source code | MIT | See [`LICENSE`](../LICENSE). |
| Default YOLO11n ONNX weights | AGPL-3.0 | See [`models/README.md`](../models/README.md). |
| `@vladmandic/human` | MIT | BlazeFace assets are staged from the npm package. |
| `onnxruntime-web` | MIT | Browser runtime files are vendored locally. |
| TensorFlow.js WASM backend | Apache-2.0 | Vendored alongside Human. |
