# Accounts, sync, CSV range, and package updates — design

**Date:** 2026-11-26
**Status:** approved
**Base:** `PRODUCT_SPEC.md` MVP (local-only weight log)

## Goal

Add optional Google sign-in and cross-device sync without taking away the local-first app, and let the existing CSV export be limited to a date range. Bring all dependencies to current releases. Signed-out behaviour must remain exactly today's app.

## Decisions

| Topic | Decision |
|---|---|
| Sync backend | Cloudflare Worker + D1, same Worker that serves the SPA assets |
| Auth | Google OAuth 2.0 authorization-code flow executed in the Worker; scopes `openid email profile` only |
| Sign-in requirement | Optional. Local storage stays the source of truth; the server is a merge target |
| Synced data | Weight entries and deletion tombstones only. Unit/onboarding preferences stay device-local |
| Conflicts | Per-date last-write-wins by `updatedAt`; delete wins on a tie |
| Clear all | Server `reset_at` watermark so the wipe is not resurrected by another device |
| CSV range | From/To date inputs, empty bound = open, prefilled with earliest record and today |

## Non-goals

Reminders, sharing, multiple profiles, Google Drive storage, background sync, offline write queue, real-time push, admin UI, analytics.

## Architecture

```
Browser SPA ──GET/POST /api/*──▶ worker/index.ts ──▶ D1 (users, sessions, entries)
            └── all other paths ──▶ static assets from ./dist (unchanged)
```

`wrangler.jsonc` after the change:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "mass-weight-tracker",
  "compatibility_date": "<current>",
  "main": "./worker/index.ts",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mass-weight-tracker",
      "database_id": "<created by wrangler d1 create>",
      "migrations_dir": "./migrations"
    }
  ]
}
```

Only `/api/*` reaches the Worker. Unknown `/api/*` paths return a JSON 404, never the SPA shell. All other paths keep the existing static-asset + SPA fallback behaviour.

The Worker has no framework and no ORM. It is one `fetch` router with prepared statements, plus two small helpers shared with the client.

TypeScript: no `@cloudflare/workers-types` dependency. `worker/types.ts` declares the minimal `Env`, `D1Database`, `D1PreparedStatement` and `D1Result` shapes the code uses, avoiding DOM/Worker type collisions.

## Data model

### Local (schema v2)

```ts
export interface WeightRecord {
  id: string;          // local identity for edit/delete UI; never synced
  date: string;        // YYYY-MM-DD local
  weightGrams: number; // positive integer
  updatedAt: number;   // epoch ms of the last local edit
}

export interface Tombstone { date: string; updatedAt: number; }

export interface StoredData {
  schemaVersion: 2;
  preferences: UserPreferences; // device-local, never synced
  records: WeightRecord[];
  tombstones: Tombstone[];
  resetAt: number;              // last server reset observed by this device; 0 if none
}
```

Migration on read: a valid v1 payload (`schemaVersion: 1`, no `tombstones`) loads as v2 with `updatedAt = Date.now()` for every record, `tombstones: []`, `resetAt: 0`. All existing validation and de-duplication rules stay. Unknown/corrupt payloads still fall back to defaults without throwing.

`upsert` and every mutation set `updatedAt = Date.now()`. Deleting a record moves its date into `tombstones` (replacing an older tombstone for the same date). `clearEntries` empties `records` and `tombstones`; when signed in it also calls the server clear endpoint.

### D1

```sql
CREATE TABLE users (
  sub        TEXT PRIMARY KEY,          -- Google subject id
  email      TEXT NOT NULL,
  name       TEXT,
  created_at INTEGER NOT NULL,
  reset_at   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,          -- SHA-256 hex of the cookie token
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE entries (
  user_id      TEXT NOT NULL,
  date         TEXT NOT NULL,           -- YYYY-MM-DD
  weight_grams INTEGER,                 -- NULL when deleted
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
```

Tombstones are rows with `deleted = 1` and `weight_grams = NULL`. They are kept indefinitely: at most one per day and they are what stops old devices from resurrecting deletions.

## API

All request/response bodies are JSON. Errors are `{ "error": "message" }` with `400` for malformed input, `401` for a missing/expired session, `405` for a wrong method, `413` for an oversized snapshot, and `404` for unknown `/api/*` paths.

| Route | Auth | Behaviour |
|---|---|---|
| `GET /api/auth/google` | none | Generate 32-byte `state`, set `mass_oauth_state` cookie (HttpOnly, Secure, SameSite=Lax, Path=/api/auth, Max-Age=600), 302 to Google with `client_id`, `redirect_uri = <origin>/api/auth/google/callback`, `response_type=code`, `scope=openid email profile`, `state`, `access_type=online` |
| `GET /api/auth/google/callback` | none | Verify `state` against the cookie (constant-time compare), clear the cookie. Exchange `code` at `https://oauth2.googleapis.com/token` with `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`. Read `https://openidconnect.googleapis.com/v1/userinfo` with the access token. Upsert `users`. Create session. Set `mass_session` cookie. 302 to `/`. Any failure → 400 HTML page with a link back to `/` |
| `GET /api/me` | session | `200 { email, name }` or `401 { error: "unauthorized" }` |
| `POST /api/auth/logout` | session | Delete the session row, clear cookie, `204` |
| `POST /api/sync` | session | Body `{ records: [{date, weightGrams, updatedAt}], tombstones: [{date, updatedAt}] }`. Merge, then return the full snapshot (see below) |
| `DELETE /api/records` | session | `UPDATE users SET reset_at = ?` + `DELETE FROM entries WHERE user_id = ?` in one `batch()`. Returns `{ resetAt }` |
| `DELETE /api/account` | session | Delete entries, sessions and the user row for this user, clear cookie, `204` |

Session cookie: `mass_session`, HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 90 days. Value is a 32-byte random base64url token; D1 stores only its SHA-256 hex. No signing secret. Expired rows are deleted lazily on successful sign-in.

Secrets: `GOOGLE_CLIENT_ID` (also fine as a plain var) and `GOOGLE_CLIENT_SECRET` via `wrangler secret put`; local values in `.dev.vars` (already gitignored). Nothing else.

CSRF: SameSite=Lax cookie, mutations are JSON-`POST`/`DELETE` only (non-simple requests), OAuth `state` cookie. No CORS headers are emitted.

Input validation for `/api/sync`:
- at most 10,000 records and 10,000 tombstones per request → `413` beyond that;
- `date` passes `isValidDateString`; `weightGrams` integer 1..1,500,000; `updatedAt` integer ≥ 0, clamped to `now` if more than 5 minutes in the future;
- malformed entries are dropped individually; a body that is not an object → `400`.
- entries with `updatedAt <= users.reset_at` are ignored.

### Merge rule (shared, pure)

`src/domain/sync.ts`, used by both the Worker and the client:

```ts
mergeSnapshots(
  local: Snapshot,          // { records, tombstones }
  remote: Snapshot,         // { records, tombstones }
  resetAt: number,
): { snapshot: Snapshot; changed: boolean }
```

- Collapse each side to `date → { weightGrams | null, updatedAt }` (`null` = deleted).
- For each date keep the entry with the greater `updatedAt`; on equality the deleted entry wins.
- Drop every entry with `updatedAt <= resetAt` before comparing.
- `changed` is true when the resulting local snapshot differs from the input local snapshot, so the UI can say "Updated from another device".
- Output records sorted by date ascending; tombstones sorted by date; a date never appears in both.

`Snapshot` is the wire shape (`date`, `weightGrams`, `updatedAt`) and carries no `id`. When the client applies a merged snapshot it keeps the local record's `id` for a date that already existed locally and calls `newId()` for a date that only exists remotely.

Server-side merge of the incoming snapshot is expressed in SQL per row:

```sql
INSERT INTO entries (user_id, date, weight_grams, updated_at, deleted)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(user_id, date) DO UPDATE SET
  weight_grams = excluded.weight_grams,
  updated_at   = excluded.updated_at,
  deleted      = excluded.deleted
WHERE excluded.updated_at > entries.updated_at
   OR (excluded.updated_at = entries.updated_at AND excluded.deleted = 1)
```

All rows go through one `db.batch()`. The response is the full snapshot for that user plus `resetAt`:

```json
{ "records": [{ "date": "2026-11-20", "weightGrams": 82000, "updatedAt": 1763700000000 }],
  "tombstones": [{ "date": "2026-11-19", "updatedAt": 1763600000000 }],
  "resetAt": 0 }
```

Full snapshots are deliberate: one person, at most a few thousand rows, and deltas would need a second reconciliation path. If a log ever exceeds 10k rows, switch to `since`-based deltas.

## Client behaviour

New `src/hooks/useSync.ts` (or equivalent) wrapping an `AuthState`:

1. On mount, `GET /api/me`. `401` → signed out, no network calls afterwards.
2. Signed in: run `POST /api/sync` immediately with the local snapshot, merge the response into local state, persist.
3. Re-run sync after any local mutation (debounced 800 ms), on window `online`, and when the tab becomes visible again. The full local snapshot is the queue, so a failed request needs no bookkeeping.
4. Sync failures never block or roll back local writes; status becomes "Offline" / "Not synced" with the last success time.
5. Sign out: `POST /api/auth/logout`, keep all local data, stop syncing.
6. Sign in is a normal navigation to `/api/auth/google`; the callback returns to `/` and the app re-reads `/api/me`.

`useWeightStore` keeps owning local state and gains all-or-nothing persistence plus the sync trigger. Preferences are never sent or overwritten.

Service worker: skip any request whose path starts with `/api/` in `public/sw.js` (both cache lookup and cache write). Without this, `/api/me` and sync snapshots would be served stale from the cache.

## UI changes

**Settings** — new "Account & sync" card above "Backup":

- Signed out: short line ("Entries stay on this device. Sign in to use them on all your devices.") + "Sign in with Google" button.
- Signed in: email, "Last synced …" / "Syncing…" / "Not synced", "Sync now", "Sign out", and a subdued "Delete account and cloud data" action using the existing `ConfirmDialog`.
- The Storage card copy changes from "do not sync" to: local by default; when signed in, date + weight + edit time are stored on this app's Cloudflare Worker for that Google account; sign out or delete the account to stop.
- Onboarding keeps its single line, changed to "Private by design — entries stay in this browser unless you sign in."

**Backup card** — From / To `<input type="date">` prefilled with the earliest record date and today, `min`/`max` from the data, a live "N entries" count, and Export disabled when the range is invalid (`from > to`) or empty. Filename `mass-weight-export-<from>_<to>.csv`; an empty bound renders as `all`. Export always uses local data, signed in or not.

## CSV range

`domain/weight.ts` gains:

```ts
export function filterByRange(records: WeightRecord[], from: string, to: string): WeightRecord[]
```

Empty string means unbounded. Invalid dates or `from > to` are the caller's responsibility; `Settings` computes a boolean and disables the button. `toCsv` is unchanged (`date,weight_kg,weight_lb`, oldest first).

## Package updates

Bump to current releases in one commit: `react`/`react-dom` 19.3, `vite` 8, `vitest` 5, `jsdom` 31, `@vitejs/plugin-react` 6, `@testing-library/jest-dom` 8, other testing/types/Playwright/Wrangler packages to latest. Gate: `pnpm test`, `pnpm build`, `pnpm exec playwright test`. A major that cannot pass is reverted to its current major and named in the commit message; TS 7 and Vite 8 are the likely candidates.

## Testing

Unit (Vitest):
- `mergeSnapshots`: newer remote wins, newer local wins, equal timestamps favour deletion, tombstone vs record, `resetAt` drops older entries, `changed` flag, sorted output, no date in both lists.
- Repository: v1 → v2 migration, `updatedAt` set on upsert, delete creates a tombstone, clearing removes both.
- `filterByRange`: both bounds, one bound, empty bound, empty result.
- Settings: signed-out and signed-in rendering, invalid range disables export (mock `fetch`).

Worker: thin routes over the tested merge rule; verified locally with `wrangler dev` + `curl` (sign-in flow can be completed with a real browser and the test client). No new test framework or Workers test pool.

E2E: the existing Playwright suite must pass unchanged (its v1 seeds exercise migration). Add one test for ranged CSV export.

## Deployment runbook

1. `pnpm exec wrangler d1 create mass-weight-tracker`, copy `database_id` into `wrangler.jsonc`.
2. `pnpm exec wrangler d1 migrations apply mass-weight-tracker --local` for dev.
3. `pnpm exec wrangler secret put GOOGLE_CLIENT_ID` and `... GOOGLE_CLIENT_SECRET`.
4. Google Cloud: OAuth client type **Web application**, authorized redirect URIs `http://localhost:8787/api/auth/google/callback` and `https://<worker-host>/api/auth/google/callback`. Consent screen: External, scopes `openid`, `email`, `profile`; add the owner as a test user while in Testing.
5. `pnpm exec wrangler d1 migrations apply mass-weight-tracker --remote`.
6. `pnpm build && pnpm deploy`.

Local dev: `pnpm dev:worker` (`wrangler dev --port 8787`) in one terminal, `pnpm dev` (Vite) in another; Vite proxies `/api` to `127.0.0.1:8787`. Cookies are host-based, so both ports share the session. `Secure` cookies are accepted on `localhost` by Chrome and Firefox; if a dev browser rejects them, run the Worker behind HTTPS or use a tunnel.

Add every origin you actually open (workers.dev and any custom domain) to the authorized redirect URIs, since the redirect URI is derived from the request origin and must match exactly.

## Privacy statement change

`PRODUCT_SPEC.md`, `README.md` and `CLOUDFLARE_DEPLOYMENT.md` must stop claiming data never leaves the device. New wording: signed out, entries stay in the browser and leave only via an explicit CSV download; signed in, entries are stored for that Google account on this app's Worker; no analytics, no third parties beyond Google sign-in.

## Risks and accepted limits

- Same-date edits from two offline devices: the later `updatedAt` silently wins; the losing value is gone. Shown as a one-line "Updated from another device" notice.
- Client clocks are compared; a badly wrong clock can lose a conflict. `shortcut:` comment at the merge site; upgrade to server-assigned sequence numbers if this ever matters.
- Sync runs only while the app is open; no background sync.
- No rate limiting or abuse protection on `/api/*` (single-user personal app). Add Cloudflare rate limiting if it is ever published broadly.
- Sessions are absolute 90 days, no rotation.
- Tombstones are never pruned.
- Local data is device-wide, not account-scoped: signing in with a different Google account merges this device's entries into that account. Acceptable for a personal app; add an account-switch confirmation if the app ever serves more than its owner.
