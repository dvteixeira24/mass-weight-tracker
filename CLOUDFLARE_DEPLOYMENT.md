# Cloudflare deployment notes

## Recommended deployment topology

```
User's browser
  ├── Static SPA (HTML/CSS/JS)    <- Cloudflare Workers static assets
  └── Browser localStorage         <- User's entries stay on the device

Cloudflare Workers
  └── Hosts built app assets      <- No user-measurement endpoint in V1
```

V1 deliberately avoids a server-side database and login. Hosting on Cloudflare is *not* the same as syncing data to Cloudflare. The user's saved entries stay in their current browser/profile; browsers can clear them, and they do not sync between devices. CSV backup is mandatory.

## Deploy this reference prototype (optional)
The package contains a static interactive design reference, **not the production React implementation**. From the ZIP's root directory:

```bash
pnpm install
pnpm dev
# after review:
pnpm deploy
```

`wrangler.jsonc` points `assets.directory` to `./prototype` and uses SPA not-found handling. Deployment requires Cloudflare authentication and appropriate account permissions. Use a different Worker name to avoid collisions with existing projects.

## Deploy the rebuilt production app
1. Scaffold Vite/React/TypeScript, implement and run tests.
2. `pnpm build` to produce `./dist`.
3. Set `wrangler.jsonc` `assets.directory` to `./dist` and `not_found_handling` to `single-page-application`.
4. `pnpm exec wrangler login` if not already authenticated.
5. `pnpm deploy` or `pnpm exec wrangler deploy`.
6. Open the generated `*.workers.dev` URL, verify SPA loads and data remains local.
7. Connect a custom domain in your Cloudflare account if desired.

Example configuration:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "mass-weight-tracker",
  "compatibility_date": "2026-10-28",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

If you later use the Cloudflare Vite plugin, follow that integration's guidance; it can configure asset output automatically.

## Future Cloudflare sync option (NOT part of MVP)
- Deploy a Worker API with typed auth/session validation.
- Bind Cloudflare D1 as SQL storage for authenticated user measurements.
- Enforce ownership for all record operations, add schema migrations, consent/privacy controls and an explicit local-to-cloud migration flow.
- Avoid storing anonymous personal measurements in a shared unprotected database.

## Verified official references (checked 2026-10-28)
- Workers static assets: https://developers.cloudflare.com/workers/static-assets/
- SPA routing: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- D1 (future): https://developers.cloudflare.com/d1/get-started/
