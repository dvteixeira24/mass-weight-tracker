# mass. — weight log

Minimal, private, mobile-first weight tracker. React + TS + Vite SPA served as Cloudflare Workers static assets, with an optional Worker + D1 backend for Google sign-in and cross-device sync. No analytics.

## Setup

```
pnpm install
pnpm dev            # Vite UI on :5173, proxies /api to the Worker
pnpm dev:worker     # Worker API on :8787, serves dist/ + /api/*
pnpm test           # vitest (domain, storage, merge, worker validation, screens)
pnpm build          # tsc --noEmit + vite build → dist/
pnpm preview        # preview dist/ (signed-out UI)
pnpm exec playwright test  # e2e in real Chromium (needs pnpm build first)
pnpm deploy         # wrangler deploy
```

Requires Wrangler login for deploy: `pnpm exec wrangler login`.

### Local backend

1. Copy `.dev.vars.example` to `.dev.vars` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and keep `APP_ORIGIN=http://localhost:5173` for the Vite proxy.
2. `pnpm db:migrate:local` creates the local D1 schema.
3. Run `pnpm dev:worker` and `pnpm dev` in two terminals. Cookies are host-based, so the session works across both ports.

Google Cloud OAuth client (**Web application**) redirect URIs:

```
http://localhost:5173/api/auth/google/callback
http://localhost:8787/api/auth/google/callback
https://<worker-host>/api/auth/google/callback
```

Scopes: `openid`, `email`, `profile` only.

## Use

**Install (PWA basics):** the production build is installable — `manifest.webmanifest` (standalone, theme `#151917`, 192/512 + maskable icons), iOS touch icon, and a minimal same-origin service worker (`public/sw.js`) caching the app shell for offline launch. `/api/*` is never cached. Install / Add to Home Screen from the phone browser while online once; the app then opens offline with locally stored entries.

- First visit → pick kg/lb (default kg), optionally enter today's weight, Start tracking. No account required.
- Overview → latest weight/date, period total + per-week cards (7D/30D/3M/6M/1Y/All), time-proportional SVG chart with keyboard-focusable points + data-table alternative, recent entry.
- `+` → log sheet (mobile bottom sheet / desktop dialog): number + inputMode decimal, unit visible, today default, past allowed, future blocked, finite positive only. Existing date → confirm replace. Edit from History; Delete → destructive confirm. Save → Overview, focus restored.
- History → reverse-chron monthly groups, signed delta vs preceding chronological entry ("First entry" for earliest), tap to edit.
- Settings → unit toggle (stored grams never rewritten); From/To date range with a live count and ranged CSV export (`mass-weight-export-<from>_<to>.csv`); Google account & sync card; delete-all (keeps prefs); storage explainer.

## Accounts and sync

- Signed out: entries live only in `localStorage`; the app makes no network requests.
- Signed in: the app merges the local snapshot with `/api/sync` after each edit, on load, on reconnect, and when the tab regains focus. Local storage stays the source of truth; the server is a merge target.
- Conflicts are resolved per date: newer `updatedAt` wins, a deletion wins a tie. Deletions are tombstones, so another device cannot resurrect them.
- Delete all entries also wipes the cloud rows and records a `resetAt` watermark. Delete account removes synced entries and sign-in from the server, keeping this device's data.
- Unit and onboarding preferences never sync.

## Storage & limits

- `localStorage` key `mass-weight-tracker-v1`, inner `schemaVersion: 2`, canonical integer grams, local `YYYY-MM-DD` dates, `updatedAt` per record, tombstones, `resetAt`.
- One record per date, sorted by date. Stats: total = last−first in window; weekly = total/elapsedDays×7; no rate for <2 distinct dates; gaps are not zeros.
- D1 tables: `users`, `sessions`, `entries` (see `migrations/0001_init.sql`). Sessions are opaque random tokens stored as SHA-256, 90 days, HttpOnly/Secure/SameSite=Lax.
- Sync runs only while the app is open. No background sync, no push. A failed request is retried by the next trigger; the pending data is simply the local snapshot.
- Browser/device-local unless signed in: clearable by the browser. CSV backup before deleting. Blocked storage → non-destructive notice, no crash.
- No analytics, no external fonts (system + Georgia stacks), no BMI/goals/calories/commentary.

## Cloudflare

`wrangler.jsonc`: name `mass-weight-tracker`, `main ./worker/index.ts`, `assets.directory ./dist` with `run_worker_first ["/api/*"]` and SPA fallback, D1 binding `DB`, migrations in `./migrations`.

Deploy:

```
pnpm exec wrangler d1 create mass-weight-tracker          # copy database_id into wrangler.jsonc
pnpm exec wrangler d1 migrations apply mass-weight-tracker --remote
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm build && pnpm deploy
```

Then add `https://<worker-host>/api/auth/google/callback` to the Google OAuth client.

## MVP vs future

- Now: local-only log, chart, ranged CSV, optional Google sign-in and sync (this repo).
- Future (not built): reminders, shared/household accounts, background sync, 7-day smoothing, server-assigned conflict sequence numbers.
