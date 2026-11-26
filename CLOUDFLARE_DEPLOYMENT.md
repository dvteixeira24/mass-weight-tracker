# Cloudflare deployment notes

## Topology

```
User's browser
  ├── Static SPA (HTML/CSS/JS)        <- Cloudflare Workers static assets
  └── Browser localStorage            <- Source of truth; works offline, signed out

Cloudflare Worker (worker/index.ts)
  ├── GET/POST/DELETE /api/*          <- Only these paths reach the Worker
  ├── Google OAuth code flow          <- Scopes: openid email profile
  └── D1 (binding DB)                 <- users, sessions, entries per Google account

Everything else -> ./dist (SPA fallback)
```

Signed out, the Worker is never called and measurements stay on the device. Signed in, entries (local date, grams, last-edit time) and deletion tombstones are stored in D1 keyed to the Google subject id. No analytics, no third parties beyond Google sign-in.

## Configuration

`wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "mass-weight-tracker",
  "compatibility_date": "2026-10-28",
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
      "database_id": "<from wrangler d1 create>",
      "migrations_dir": "./migrations"
    }
  ]
}
```

Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Local dev also sets `APP_ORIGIN` in `.dev.vars` (gitignored) so the OAuth redirect uses the Vite port. Production derives the origin from the request.

## Deploy

1. `pnpm exec wrangler d1 create mass-weight-tracker` and paste `database_id` into `wrangler.jsonc`.
2. `pnpm exec wrangler d1 migrations apply mass-weight-tracker --remote`.
3. `pnpm exec wrangler secret put GOOGLE_CLIENT_ID` and `pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET`.
4. Google Cloud → Credentials → OAuth client type **Web application**; authorized redirect URIs:
   - `http://localhost:5173/api/auth/google/callback`
   - `http://localhost:8787/api/auth/google/callback`
   - `https://<worker-host>/api/auth/google/callback`
   Consent screen: External, scopes `openid`, `email`, `profile`; add the owner as a test user while in Testing.
5. `pnpm build && pnpm deploy`.
6. Open the `*.workers.dev` URL (or custom domain, registered in the redirect list), sign in from Settings, add an entry, and confirm the row in D1:

```bash
pnpm exec wrangler d1 execute mass-weight-tracker --remote --command \
  "SELECT user_id, date, weight_grams, updated_at, deleted FROM entries LIMIT 5"
```

## Local development

```bash
pnpm db:migrate:local
pnpm dev:worker        # :8787, serves dist/ and /api/*
pnpm dev               # :5173, proxies /api to :8787
```

Cookies are host-based, so the session created through either port works on both. `Secure` cookies are accepted on `localhost` by Chrome and Firefox.

## Operational notes

- Sessions: 90-day absolute expiry, deleted on sign-out, expired rows purged lazily at sign-in.
- `DELETE /api/records` sets `users.reset_at` and clears rows, so a later sync from an old device cannot resurrect a wipe.
- Tombstones are kept indefinitely (at most one row per deleted date). They are what keeps deletions durable across devices.
- No rate limiting; this is a personal app. Add Cloudflare rate limiting before opening it to the public.
- Live remote-vs-local divergence is resolved per date by `updatedAt`; see `src/domain/sync.ts`.

## Verified references (checked 2026-11-26)

- Workers static assets + `run_worker_first`: https://developers.cloudflare.com/workers/static-assets/
- SPA routing: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- D1 + migrations: https://developers.cloudflare.com/d1/
- Google OAuth web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server
