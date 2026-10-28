# mass. — weight log (MVP)

Minimal, private, mobile-first weight tracker. React + TS + Vite SPA, served as Cloudflare Workers static assets. No backend, no sync, no analytics.

## Setup

```
pnpm install
pnpm dev        # local dev
pnpm test       # vitest (33 tests: dates, conversions, periods, storage, journeys)
pnpm build      # production → dist/
pnpm preview    # preview dist/
pnpm exec playwright test  # e2e in real Chromium (needs pnpm build first)
pnpm deploy     # wrangler deploy (static dist/, SPA fallback)
```

Requires Wrangler login for deploy: `pnpm exec wrangler login`.

## Use

- First visit → pick kg/lb (default kg), optionally enter today's weight, Start tracking.
- Overview → latest weight/date, period total + per-week cards (7D/30D/3M/6M/1Y/All), time-proportional SVG chart with keyboard-focusable points + data-table alternative, recent entry.
- `+` → log sheet (mobile bottom sheet / desktop dialog): number + inputMode decimal, unit visible, today default, past allowed, future blocked, finite positive only. Existing date → confirm replace. Edit from History; Delete → destructive confirm. Save → Overview, focus restored.
- History → reverse-chron monthly groups, signed delta vs preceding chronological entry ("First entry" for earliest), tap to edit.
- Settings → unit toggle (stored grams never rewritten), ordered CSV export (`date,weight_kg,weight_lb`), delete-all (keeps prefs), storage explainer.

## Storage & limits

- `localStorage` key `mass-weight-tracker-v1`, schemaVersion 1, canonical integer grams, local `YYYY-MM-DD` dates only.
- One record per date, sorted by date. Stats: total = last−first in window; weekly = total/elapsedDays×7; no rate for <2 distinct dates; gaps are not zeros.
- Browser/device-local: clearable by the browser, no sync. CSV backup before deleting. Blocked storage → non-destructive notice, no crash.
- V1 has no login/OAuth, D1/R2/KV, backend, third-party APIs, analytics, external fonts (system + Georgia stacks), BMI/goals/calories/commentary.

## Cloudflare

`wrangler.jsonc`: name `mass-weight-tracker`, current `compatibility_date`, `assets.directory ./dist`, `not_found_handling single-page-application`, no entrypoint. Verified: `pnpm build` + `pnpm exec wrangler deploy --dry-run`.

## MVP vs future

- MVP: local-only log, chart, CSV backup (this repo).
- Future (not built): D1 + auth sync with explicit migration, reminders, optional PWA offline launch, 7-day smoothing.
