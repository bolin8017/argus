# Deploy Argus to Cloudflare Pages (free tier)

End users only open a URL; **they never run `npm`**. Dependencies and weights are built in CI or on Cloudflare’s build machines, then only static files under `dist/` are published.

## What you need from Cloudflare

1. A [Cloudflare](https://dash.cloudflare.com/) account (free).
2. **Pages** → **Create a project** → **Connect to Git** → pick this repository.
3. After the first deploy, note your site URL (e.g. `https://argus.pages.dev` — the subdomain depends on your project name).

## Build settings (dashboard)

| Setting | Value |
|--------|--------|
| **Framework preset** | None |
| **Root directory** | `/` (repository root) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Environment variables** | `NODE_VERSION` = `24` (recommended; matches `.nvmrc`) |

Optional but recommended for reproducible installs:

| Setting | Value |
|--------|--------|
| **Install command** | `npm ci` |

Cloudflare runs the install command, then the build command. `postinstall` vendors ORT + Human; `npm run build` downloads the default YOLO ONNX and copies `index.html`, `src/`, `tests/`, `vendor/`, `models/`, and `public/_headers` into `dist/`.

## HTTP headers

`public/_headers` is copied to `dist/_headers` so Pages serves the same **COOP / COEP / CORP** policy as `server.mjs` (required for threaded WASM). Do not remove those headers on the live site without understanding the impact on `SharedArrayBuffer`.

## Cloudflare Pages limits

**Per-file size:** Pages rejects any single asset **larger than 25 MiB**. Argus therefore does not vendor `ort-wasm-simd-threaded.jsep.wasm` (unused by the ORT 1.26 webgpu bundle but ~25 MiB). See `scripts/vendor-ort.mjs`.

## Project name conflicts

If the slug `argus` is taken globally on `*.pages.dev`, pick another **project name** in the Cloudflare UI and align:

- `wrangler.toml` → `name = "your-slug"`
- CLI: `npx wrangler pages deploy dist --project-name=your-slug`

## Optional: deploy from GitHub Actions

If you prefer pushes to `main` to deploy automatically:

1. Cloudflare dashboard → **My Profile** → **API Tokens** → create a token with **Cloudflare Pages — Edit** (and read permissions as required by the token template).
2. Dashboard → **Workers & Pages** → your project → **Settings** → copy **Account ID**.
3. In GitHub: **Settings → Secrets and variables → Actions** → add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. **Settings → Secrets and variables → Actions → Variables** → add:
   - `CF_PAGES_ENABLE` = `true`

The workflow in `.github/workflows/ci.yml` uploads `dist/` and runs `wrangler pages deploy` when `CF_PAGES_ENABLE` is `true` and the branch is `main` (push only). Turn the variable off to skip deploys without removing secrets.

## Custom domain (optional)

In the Pages project: **Custom domains** → add your domain and follow DNS instructions.

## Local smoke test of the production bundle

```bash
npm ci
npm run build
npm run verify:pages
npx wrangler pages dev dist
```

Open the URL Wrangler prints and test `/` and `/tests/yolo.html`.

---

## `cloudflared` (Tunnel) vs Cloudflare Pages

**`cloudflared`** drives [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) — it forwards traffic from the internet (or your zone’s DNS) **to a process on your machine** (e.g. `node server.mjs`). It does **not** create a Pages project, set build commands, upload `dist/`, or apply `public/_headers` at the edge. For that, use the **Pages dashboard** or **`npx wrangler pages deploy`** (see above).

Use both when they fit different jobs: **Pages** = hosted static site for everyone; **Tunnel** = quick HTTPS link to your laptop.

### Quick Try (no `tunnel login` — ephemeral URL)

Good for sharing a demo or testing webcam over **HTTPS** without publishing to Pages.

1. Terminal A — run the app locally (headers come from `server.mjs`):

   ```bash
   npm ci
   npm run model:fetch
   npm run dev
   ```

2. Terminal B — start a quick tunnel to that port (default Argus port is **8765**):

   ```bash
   cloudflared tunnel --url http://127.0.0.1:8765
   ```

3. Open the printed `https://*.trycloudflare.com` URL in the browser. Grant camera permission when prompted.

**Caveats:** The hostname changes each run; traffic goes through Cloudflare’s trycloudflare service — fine for personal tests, not a replacement for a production Pages URL.

### Named tunnel (your own hostname)

Requires a Cloudflare zone and one-time auth:

```bash
cloudflared tunnel login
cloudflared tunnel create argus-dev
cloudflared tunnel route dns argus-dev argus-dev.example.com   # use your domain
cloudflared tunnel run --url http://127.0.0.1:8765 argus-dev
```

Exact DNS flags depend on your setup; see the [Tunnel guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/tunnel-guide/).

### Pointing a tunnel at the production-shaped `dist/`

If you tunnel to a static file server that **does not** send COOP/COEP/CORP, threaded WASM may break. Prefer tunneling to **`npx wrangler pages dev dist`** (serves `dist/` with the right isolation headers) instead of plain `python -m http.server`.
