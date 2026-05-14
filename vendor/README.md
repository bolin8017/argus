# vendor/

放第三方 runtime 的離線檔案（不入 git，見 `.gitignore`）。

預設要放：
- `vendor/ort/`：從 `node_modules/onnxruntime-web/dist/` 複製出來的 `.wasm` 與 `.mjs`，例如：
  - `ort.webgpu.bundle.min.mjs`
  - `ort-wasm-simd-threaded.wasm` / `.mjs`
  - `ort-wasm-simd-threaded.jsep.wasm` / `.mjs`

在程式裡用：
```js
import * as ort from '/vendor/ort/ort.webgpu.bundle.min.mjs';
ort.env.wasm.wasmPaths = '/vendor/ort/';
```

之後可以加個 `npm run vendor:ort` 腳本自動同步。
