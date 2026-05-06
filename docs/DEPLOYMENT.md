# Deployment

Who Read Me is optimized for Cloudflare Pages connected to GitHub, with Wrangler used for resource provisioning and the API Worker.

## Required Accounts

- Cloudflare account.
- Google Cloud project for OAuth credentials.
- GitHub repository connected to Cloudflare Pages.

## Google OAuth

Create a Google OAuth web application. Add these redirect URIs:

- `https://YOUR_API_HOST/auth/google/callback`
- `http://localhost:8787/auth/google/callback` for local Worker development.

Set the Worker secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --config apps/api/wrangler.toml
npx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/api/wrangler.toml
npx wrangler secret put SESSION_SECRET --config apps/api/wrangler.toml
```

`SESSION_SECRET` protects dashboard sessions, signed tracking URLs, extension tokens, and encrypted Google refresh tokens.

The OAuth consent screen must include these scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.send`

Gmail send permission is required because accurate per-recipient open attribution requires individualized tracked sends.

## Cloudflare Resources

Create resources:

```bash
npx wrangler d1 create who-read-me
npx wrangler r2 bucket create who-read-me-artifacts
npx wrangler queues create who-read-me-events
```

Copy the generated D1 database ID into `apps/api/wrangler.toml`.

Apply migrations:

```bash
npx wrangler d1 migrations apply who-read-me --config apps/api/wrangler.toml
```

Deploy the API:

```bash
npm run deploy:api
```

Deploy the dashboard with Cloudflare Pages GitHub integration. Use `apps/web` as the project directory and `dist` as the build output directory.

## Extension

Build the extension:

```bash
npm run build:extension
```

Load `apps/extension/dist` in Chrome at `chrome://extensions` with Developer Mode enabled.
