# Argus

**Turn a webcam into a browser-only rear-view presence alert.**

Named after Argus Panoptes, the many-eyed watcher who never fully slept.

[![CI](https://github.com/bolin8017/argus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bolin8017/argus/actions/workflows/ci.yml)

[繁體中文](docs/i18n/README.zh-TW.md) · [Live demo](https://argus-bnl.pages.dev/) · [Architecture](docs/ARCHITECTURE.md) · [Deploy](docs/DEPLOY.md) · [Contribute](CONTRIBUTING.md)

Argus is a browser-only real-time vision project. It detects people locally, tracks person boxes across frames, upgrades the alert level when a face appears, and deploys as a static web app. No backend inference service, desktop agent, Python runtime, Docker image, or GPU driver setup is required.

## What It Does

Argus watches the webcam feed and reports three factual states:

- `無人`: no qualifying person is present.
- `有人`: a person is detected.
- `偵測到臉`: a face is detected inside a person region, so the alert level increases.

Alerts can use an in-page sound, a system notification, and a visual lamp. Sensitivity presets keep the UI approachable, while advanced settings expose person and face thresholds when needed.

## Why It Stands Out

- **Browser-only ML:** video stays in the browser; there is no server-side inference path.
- **Two-stage vision pipeline:** YOLO11n finds people first; BlazeFace runs only inside person ROIs.
- **Portfolio-ready engineering:** real-time video loop, tracker smoothing, alert state machines, unit tests, CI, and Cloudflare Pages deployment.
- **Static deployment:** the production app is HTML, JavaScript, vendored browser runtimes, model assets, and isolation headers.

## Try It

Open the live site and grant camera permission:

**https://argus-bnl.pages.dev/**

For the best demo, use a Chromium-class browser. Safari and Firefox fall back to WASM where supported. Keep the tab open; background audio, camera, and notification behavior vary by browser and OS.

## Architecture at a Glance

```text
webcam frame
  -> person detector: YOLO11n + ONNX Runtime Web
  -> track smoothing: ByteTrack-lite
  -> face detector: Human / BlazeFace inside person ROIs
  -> graded alert coordinator
  -> sound / notification / visual lamp
```

The preview is mirrored for the user, but the models read the original frame. The overlay compensates for the mirror transform so boxes line up with what you see.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full pipeline, repository layout, CI, asset handling, and runtime notes.

## Run Locally

```bash
git clone https://github.com/bolin8017/argus.git
cd argus
nvm use                    # optional: Node 24 per .nvmrc
npm install                # vendors browser runtimes
npm run model:fetch        # downloads YOLO weights
npm run dev                # http://localhost:8765/
```

Open `http://localhost:8765/` and allow webcam access.

## Development

```bash
npm test
npm run build
npm run verify:pages
```

Manual sanity pages:

- [`/tests/yolo.html`](tests/yolo.html) — one-shot YOLO preprocess, inference, and NMS on a dropped image.
- [`/tests/face.html`](tests/face.html) — the same person-to-face path as the main app on a dropped image.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — pipeline, repo layout, scripts, CI, and runtime assets.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — Cloudflare Pages and tunnel-based demos.
- [`docs/UPGRADING.md`](docs/UPGRADING.md) — dependency, model, and vendored asset updates.
- [`models/README.md`](models/README.md) — model download, weights, and license notes.

## License and Safety

Source code in this repository is MIT licensed. The default YOLO11n ONNX weights are AGPL-3.0; see [`models/README.md`](models/README.md) before redistributing or shipping a derived product.

Argus is a personal and educational demo, not a safety-critical monitoring system.
