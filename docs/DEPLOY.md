# Deploying cairn to cairn.connick.me

cairn ships as a **single Cloudflare Worker** that serves both the JSON API (`/api/*`) and
the built React SPA (everything else) from one origin. Same origin → no CORS, one deploy.

```
                       cairn.connick.me  (Cloudflare Worker)
                        ├── /api/gpx      ─┐
                        ├── /api/extract   ├─ run_worker_first → Hono routes (api/src/index.ts)
                        ├── /api/snap     ─┘
                        └── /  /assets/*  ─── static SPA assets (web/dist), index.html fallback
```

---

## Prerequisites (one-time)

- A Cloudflare account that owns the **connick.me** zone (already on CF ✓).
- Wrangler auth: `npx wrangler login` (opens a browser, OAuth). Confirm with `npx wrangler whoami`.
  - If your login has **multiple accounts**, add `"account_id": "<id>"` to `api/wrangler.jsonc`
    or export `CLOUDFLARE_ACCOUNT_ID`. `npx wrangler whoami` lists the IDs.
- Your **Anthropic API key** (the same one you use locally in `api/.dev.vars`).
- Repo cloned with deps installed: `npm install` at the repo root.

---

## Step 1 — Make the Worker serve the SPA + attach the domain

Edit **`api/wrangler.jsonc`** to:

```jsonc
{
  "name": "cairn-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "../web/dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "routes": [
    { "pattern": "cairn.connick.me", "custom_domain": true }
  ]
}
```

What each addition does:
- `assets.directory` — the built SPA that gets uploaded alongside the Worker.
- `not_found_handling: "single-page-application"` — non-API, non-file paths serve `index.html`.
- `run_worker_first: ["/api/*"]` — API paths invoke the Worker; everything else serves a
  static asset. (Requires wrangler ≥ 3.9x; this repo is on 4.x.)
- `routes[].custom_domain` — provisions `cairn.connick.me` (DNS record + TLS cert)
  automatically because the zone is already on Cloudflare. (`nodejs_compat` is required —
  the Anthropic SDK imports Node built-ins.)

---

## Step 2 — Set the API key as a Worker secret

```bash
cd api
npx wrangler secret put ANTHROPIC_API_KEY
# paste the key at the prompt (input hidden)
```

Optional — pin a specific Overpass mirror (defaults to `https://overpass-api.de/api/interpreter`):

```bash
npx wrangler secret put OVERPASS_URL    # e.g. https://overpass.kumi.systems/api/interpreter
```

> Secrets live encrypted on the Worker and are never in git. `api/.dev.vars` is local-only.

---

## Step 3 — Build the frontend

```bash
# from the repo root
npm run build --workspace web      # → web/dist
```

---

## Step 4 — Deploy

```bash
cd api
npx wrangler deploy
```

This bundles the Worker, uploads `web/dist` as static assets, and binds the custom domain.
The **first** deploy of a custom domain can take ~1 minute to issue the TLS certificate.

---

## Step 5 — Verify

In a browser at **https://cairn.connick.me**:
1. The **Upload** screen loads (SPA served).
2. Upload a page photo → **Extract with AI** fills the table (confirms the key + `/api/extract`).
3. **Snap to roads** draws a road-following line (confirms `/api/snap` + Overpass + the User-Agent fix).
4. **Download GPX** produces a valid file.

Quick API smoke from a terminal:

```bash
curl -s -X POST https://cairn.connick.me/api/gpx \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke","segments":[{"name":"s","instructions":[{"text":"x","gps":{"raw":"N38°28.33'\'' W120°12.45'\''"}}]}]}' \
  | head -c 120        # → a <gpx> document
```

---

## Redeploy & rollback

- **Redeploy:** rebuild the web app, then `wrangler deploy` again:
  ```bash
  npm run build --workspace web && (cd api && npx wrangler deploy)
  ```
- **Rollback:** `cd api && npx wrangler deployments list` then `npx wrangler rollback [<id>]`.
- **Logs (live):** `cd api && npx wrangler tail`.

---

## Notes & gotchas

- **No CORS** — SPA and API share the origin, so nothing CORS-related is needed.
- **Dev workflow unchanged for iteration:** keep using `npm run dev --workspace web` (Vite,
  with its `/api` proxy) + `npm run dev --workspace cairn-api` for fast frontend/API loops.
  Note that once `assets.directory` is set, a bare `npx wrangler dev` expects `web/dist` to
  exist — run the web build first if you want to preview the *integrated* (Worker-served) build.
- **Costs:** Workers' free tier covers low personal volume. Your real cost is the Anthropic
  vision call per extracted page (Opus 4.8). Overpass is free.
- **Overpass reliability:** the public endpoint throttles/occasionally overloads; the app
  falls back to straight lines and tells you. If it bites, set `OVERPASS_URL` to a mirror,
  or add R2/D1 caching (noted as the next enhancement in the Phase 4 spec).
- **Optional:** rename the Worker from `cairn-api` to `cairn` (`"name": "cairn"`) if you want
  the dashboard name to match the domain — cosmetic; the custom domain works either way.
