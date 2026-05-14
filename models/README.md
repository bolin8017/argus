# models/

Phase 1 detector weights. Not committed to git (see `.gitignore`).

## Quick start

```bash
npm run model:fetch          # downloads yolo11n.onnx (fp32) by default
npm run model:fetch -- --list  # show all supported weights
```

The script verifies SHA-256 and is idempotent — re-running on an existing
verified file is a no-op (use `-- --force` to re-download).

## Supported weights

| Name | File | Size | Notes |
|---|---|---|---|
| `yolo11n` (default) | `yolo11n.onnx` | 10.7 MiB | fp32, COCO80, 1×3×640×640. Works on both WebGPU and WASM EP. |
| `yolo11n-fp16` | `yolo11n_fp16.onnx` | 5.4 MiB | fp16 variant, **WebGPU only** (WASM EP has poor fp16 op coverage). |

Source: <https://huggingface.co/webnn/yolo11n> (Ultralytics YOLO11n exported to
ONNX). License: **AGPL-3.0** — fine for prototyping; revisit before shipping
commercial (we plan to evaluate YOLOX-nano / RT-DETR for Apache-licensed
alternatives, per the project README).

## If you already have a `.pt`

```bash
yolo export model=yolo11n.pt format=onnx opset=17 imgsz=640 half=false
mv yolo11n.onnx models/
```

`half=false` keeps fp32 so the WASM fallback path stays usable. Then verify:

```bash
shasum -a 256 models/yolo11n.onnx
# expect: 7d8fd1717d9d5bbab6986cd134afb620649c7a394303d55b1e09fc00804cc5c1
```

If your re-export doesn't match this hash, that's expected (export is not
bit-reproducible across torch versions). The hash check only applies to the
binary we mirror from Hugging Face.
