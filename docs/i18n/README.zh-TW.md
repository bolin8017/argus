# Argus

**把 webcam 變成瀏覽器內的後方來人提醒。**

希臘神話裡永不闔眼的百眼巨人；在你看不到的地方，替你看著。

[![CI](https://github.com/bolin8017/argus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bolin8017/argus/actions/workflows/ci.yml)

[English](../../README.md) · [線上 Demo](https://argus-bnl.pages.dev/) · [架構](../ARCHITECTURE.md) · [部署](../DEPLOY.md) · [貢獻](../../CONTRIBUTING.md)

Argus 是一個 browser-only 的即時視覺作品：它在本機瀏覽器裡偵測人、追蹤畫面中的人形，並在臉部進入畫面時提高提醒等級。整個應用可以部署成靜態網站，不需要後端推論服務、桌面程式、Python 環境或 GPU driver 設定。

## 它做什麼

Argus 會讀取 webcam 畫面，並回報三個清楚、不誇大的狀態：

- `無人`：目前沒有符合門檻的人。
- `有人`：畫面中偵測到人。
- `偵測到臉`：在人物區域內偵測到臉，提醒等級提高。

提醒可以透過頁內提示音、系統通知和視覺燈號輸出。一般使用者可以直接選擇敏感度模式，進階使用者也能調整人形與臉部判定門檻。

## 亮點

- **瀏覽器內 ML：** 不把影像送到伺服器，不需要桌面 agent，也不用安裝 Python、Docker 或 GPU driver。
- **兩階段視覺管線：** 先用 YOLO11n 找人，再只在人物 ROI 內跑 BlazeFace，降低不必要的臉部推論。
- **可展示的工程完整度：** real-time video loop、tracking smoothing、alert state machine、unit tests、CI、Cloudflare Pages deployment 都有實作。
- **靜態網站部署：** production 版本只有 HTML、JavaScript、vendored browser runtimes、model assets 和必要的 isolation headers。

## 立即試用

開啟網站並允許攝影機權限：

**https://argus-bnl.pages.dev/**

建議使用 Chromium 系瀏覽器取得最佳體驗。Safari 和 Firefox 會在支援時走 WASM fallback。請保持分頁開啟；背景音訊、相機和通知行為會因瀏覽器與作業系統而異。

## 架構概覽

```text
webcam frame
  -> person detector：YOLO11n + ONNX Runtime Web
  -> track smoothing：ByteTrack-lite
  -> face detector：Human / BlazeFace inside person ROIs
  -> graded alert coordinator
  -> sound / notification / visual lamp
```

預覽畫面會鏡像顯示給使用者，但模型讀取的是原始畫面；overlay 會補償鏡像座標，讓偵測框對齊你看到的位置。

完整 pipeline、repo layout、CI、asset handling 和 runtime notes 請看 [`ARCHITECTURE.md`](../ARCHITECTURE.md)。

## 本機執行

```bash
git clone https://github.com/bolin8017/argus.git
cd argus
nvm use                    # optional: Node 24 per .nvmrc
npm install                # vendors browser runtimes
npm run model:fetch        # downloads YOLO weights
npm run dev                # http://localhost:8765/
```

打開 `http://localhost:8765/` 並允許攝影機權限。

## 開發與驗證

```bash
npm test
npm run build
npm run verify:pages
```

手動檢查頁：

- [`/tests/yolo.html`](../../tests/yolo.html)：拖放圖片後測試 YOLO preprocess、inference 和 NMS。
- [`/tests/face.html`](../../tests/face.html)：用拖放圖片測試主應用相同的人形到臉部管線。

## 文件

- [`ARCHITECTURE.md`](../ARCHITECTURE.md)：pipeline、repo layout、scripts、CI 和 runtime assets。
- [`DEPLOY.md`](../DEPLOY.md)：Cloudflare Pages 和 tunnel demo。
- [`UPGRADING.md`](../UPGRADING.md)：dependency、model 和 vendored asset 更新。
- [`models/README.md`](../../models/README.md)：模型下載、weights 和授權說明。

## 授權與安全

此 repo 的 source code 採 MIT License。預設 YOLO11n ONNX weights 是 AGPL-3.0；若要重新散布或做成產品，請先閱讀 [`models/README.md`](../../models/README.md)。

Argus 是個人與教育用途的 demo，不是安全關鍵監控系統。
