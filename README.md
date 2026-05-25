# Argus

**Argus turns a webcam into a lightweight rear-view presence alert.** It detects people in the browser, raises the alert level when a face appears, and ships as a static web app.

> 希臘神話裡永不闔眼的百眼巨人；在你看不到的地方，替你看著。

[![CI](https://github.com/bolin8017/argus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bolin8017/argus/actions/workflows/ci.yml)

[Live demo](https://argus-bnl.pages.dev/) · [Architecture](docs/ARCHITECTURE.md) · [Deploy](docs/DEPLOY.md) · [Contribute](CONTRIBUTING.md)

## What It Does

Argus watches the webcam feed locally and reports three factual states:

- `無人` — no qualifying person is present.
- `有人` — a person is detected.
- `偵測到臉` — the alert level upgrades when a face is visible inside a person track.

Alerts can use an in-page sound, a system notification, and a visual lamp. Sensitivity presets keep the UI simple, while advanced settings expose person and face thresholds when needed.

## Why It Stands Out

- **Browser-only ML:** no server inference, desktop agent, Python service, Docker image, or GPU driver setup.
- **Two-stage vision pipeline:** YOLO11n finds people first; BlazeFace runs only inside person regions.
- **Portfolio-ready engineering:** real-time video loop, tracker smoothing, alert state machines, unit tests, CI, and Cloudflare Pages deployment.
- **Static deployment:** the live app is just HTML, JavaScript, vendored browser runtimes, model assets, and isolation headers.

## Try It

Open the live site and grant camera permission:

**https://argus-bnl.pages.dev/**

For the best demo, use a Chromium-class browser. Safari and Firefox fall back to WASM where supported. Keep the tab open; background audio and camera behavior vary by browser and OS.

## How It Works

```text
webcam frame
  -> person detector (YOLO11n + ONNX Runtime Web)
  -> track smoothing (ByteTrack-lite)
  -> face detector inside person ROIs (Human / BlazeFace)
  -> graded alert coordinator
  -> sound / notification / visual lamp
```

The preview is mirrored for the user, but the models read the original frame. The overlay compensates so boxes line up with what you see.

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
