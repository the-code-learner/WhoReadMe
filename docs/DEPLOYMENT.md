# Deployment

Who Read Me is optimized for Cloudflare Pages connected to GitHub, with Wrangler used for resource provisioning and the API Worker.

## Required Accounts

- Cloudflare account.
- Cloudflare Email Sending configured for the API Worker sender.
- Cloudflare Zero Trust for Pages Access protection.
- Google Cloud project for OAuth credentials.
- GitHub repository connected to Cloudflare Pages.

## Owner Access

The dashboard accepts exactly one owner email per deployment. Before an owner exists, the first email that successfully verifies a one-time link or code becomes the owner. After that, only that same email receives access emails.

Protect the Pages hostname with Cloudflare Access:

1. Enable the One-time PIN identity provider in Cloudflare Zero Trust.
2. Create an Access application for the Pages hostname.
3. Add one Allow policy with the owner email as the only included identity.
4. Do not store that email in this repository. Keep it in Cloudflare Access configuration only.

The Worker also enforces the same single-owner rule in D1, so API data remains protected even if Pages protection is misconfigured.

## Email Sending

The API Worker uses the `AUTH_EMAIL` send-email binding to send one-time links and six-digit codes. Configure Cloudflare Email Sending for your domain, then set the sender outside the repository:

```bash
npx wrangler secret put AUTH_EMAIL_FROM --config apps/api/wrangler.toml
```

The value should be a verified sender string accepted by Cloudflare Email Sending. Keep `.dev.vars`, `.env`, and all real sender or owner addresses untracked.

## Google OAuth

Google OAuth links Gmail sending after the owner has signed in by email. Create a Google OAuth web application. Add these redirect URIs:

- `https://YOUR_API_HOST/auth/google/callback`
- `http://localhost:8787/auth/google/callback` for local Worker development.

Set the Worker secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --config apps/api/wrangler.toml
npx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/api/wrangler.toml
npx wrangler secret put SESSION_SECRET --config apps/api/wrangler.toml
```

`SESSION_SECRET` protects owner sessions, one-time access challenges, signed tracking URLs, extension tokens, and encrypted Google refresh tokens.

The OAuth consent screen must include these scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/gmail.send`

Gmail send permission is required because accurate per-recipient open attribution requires individualized tracked sends. The Google account does not become the dashboard owner; the owner email remains the deployment access identity.

## Cloudflare Resources

Create resources:

```bash
npx wrangler d1 create who-read-me
npx wrangler r2 bucket create who-read-me-artifacts
npx wrangler queues create who-read-me-events
```

Keep the generated D1 database ID outside the repository. Set these values in your local shell or private CI secret store before applying migrations or deploying the API:

- `WRM_D1_DATABASE_ID`
- `WRM_APP_ORIGIN`
- `WRM_API_ORIGIN`

Apply migrations:

```bash
npm run migrate:api
```

Deploy the API:

```bash
npm run deploy:api
```

Deploy the dashboard with Cloudflare Pages GitHub integration. Use `apps/web` as the project directory and `dist` as the build output directory.

Set the Pages build environment variable `API_ORIGIN` to the deployed API origin. The build emits a static `config.js` with that public origin only. For direct Wrangler deploys, use:

```bash
npm run deploy:web
```

Before daily use, follow `docs/SELF_HOST_CHECKLIST.md`.

## Extension

Build the extension:

```bash
npm run build:extension
```

Load `apps/extension/dist` in Chrome at `chrome://extensions` with Developer Mode enabled.
