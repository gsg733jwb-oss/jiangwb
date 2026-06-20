# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **static, client-side web app** (吉隆坡旅游行程 / Kuala Lumpur travel guide). There is no build step, no bundler, and no npm/JS dependency install.

### Run / develop

- Serve the static files from the repo root, e.g. `python3 -m http.server 8080`, then open `http://127.0.0.1:8080/`. (`打开行程.command` is a macOS-only convenience wrapper for the same server.)
- App data is loaded from `data/trip.inline.js` (sets `window.__TRIP_DATA__`); `app.js` only falls back to `fetch('data/trip.json')` if that global is missing. Because of the inline script, the page works even when opened directly, but use the HTTP server so Leaflet tiles/assets and the `fetch` fallback resolve correctly.
- Map uses **vendored Leaflet** under `vendor/leaflet/` plus a static image `assets/kl-map.jpg`; no CDN/network needed.

### Lint / test / build

- There are **no lint, test, or build commands** in this repo (no `package.json`, no test framework, no CI build other than `.github/workflows/pages.yml`, which just uploads the repo as a GitHub Pages artifact).

### Updating trip data (optional)

- `scripts/export_trip.py` regenerates `data/trip.json` + `data/trip.inline.js` from an Excel file expected at `~/Desktop/KL_Travel_Guide_2026-07-12_to_15.xlsx`. It requires `openpyxl` and the Excel file (not in the repo), so it is not runnable in CI/cloud by default.
