# models/

放 Phase 1 的偵測模型權重（不入 git，見 `.gitignore`）。

預設要放：
- `yolo11n.onnx`（Ultralytics export，輸入 1x3x640x640，fp16 建議）
- 之後若改用 YOLOX-nano：`yolox_nano.onnx`

下載方式（之後在這裡補腳本）：
1. 從 Ultralytics 或 Hugging Face 下載 `.pt`/`.onnx`。
2. 若是 `.pt`，用 `yolo export model=yolo11n.pt format=onnx opset=17 imgsz=640 half=true` 轉出。
3. 把產出檔放在本目錄。
