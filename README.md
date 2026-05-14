# Argus

> Greek mythology: Argus Panoptes — the all-seeing giant covered in eyes who never fully slept.
> 在你看不到的地方，它替你看著。

純瀏覽器（無需 Python/Docker/GPU 驅動）的兩階段視覺管線：

1. **Phase 1 — Person Presence**：偵測畫面裡是否有人，輸出穩定的 bounding box（YOLO + ByteTrack/IoU 平滑）。
2. **Phase 2 — Face Detail**：只在 Phase 1 的 ROI 上做人臉與相關屬性（`@vladmandic/human` 或同類）。

## 設計重點

- **純網頁可跑**：只需 `localhost` 或靜態託管。
- **框優先穩**：可接受較大 bundle 與較長載入時間，換取偵測框穩定。
- **離線可放**：模型、`onnxruntime-web` wasm 全可放在 `models/` 與 `vendor/`，不依賴 CDN。

## 預設技術選型（v0）

| 層 | 選擇 | 備註 |
|---|---|---|
| 偵測引擎 | [onnxruntime-web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) | WebGPU 優先，WASM SIMD+Threads 降級 |
| Phase 1 模型 | YOLO11n（或 YOLOX-nano） | YOLO11n 框較穩但 AGPL；YOLOX-nano 是 Apache-2.0 替代 |
| 追蹤器 | ByteTrack-Lite + bbox EMA | 參考 [nomi30701/YOLO-ByteTrack-ONNX-Web](https://github.com/nomi30701/YOLO-ByteTrack-ONNX-Web) |
| Phase 2 模型 | `@vladmandic/human` | 只在 person ROI 內呼叫，且降頻 |
| 伺服器 | `server.mjs`（內建 COOP/COEP header） | 讓 WASM threads 可用 |

詳細的選型理由與替代方案，見隔壁專案 `human/` 中我們的 survey（後續可移植進此 repo 的 `docs/`）。

## 目錄結構

```
argus/
  index.html         # 入口頁
  server.mjs         # 靜態檔伺服器（含 Cross-Origin Isolation header）
  src/               # 應用程式碼（detector / tracker / pipeline / UI）
  models/            # 放 yolo11n.onnx 等模型（gitignore 排除大檔，README 內說明）
  vendor/            # 放 onnxruntime-web 的 .wasm / .mjs，離線時用
```

## 開發

```bash
nvm use            # Node 24（見 .nvmrc）
npm install
npm run dev        # 開 http://localhost:8765
```

## License

TBD（依最終選用的模型而定；若採 YOLO11n 模型權重需注意 AGPL-3.0）。

