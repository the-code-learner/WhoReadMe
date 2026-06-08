# Who Read Me

Who Read Me is a self-hostable email tracking and tracker-detection product for Gmail. It combines a Chrome extension with Cloudflare infrastructure so an individual user can deploy their own private instance.

The project is designed around Cloudflare Pages, Workers, D1, R2, Queues, Workflows, Workers AI, Cloudflare email sending, and GitHub-connected deployments. Dashboard access is owned by one deployment email using one-time links or codes; Google OAuth is used only to link Gmail sending.

## Current Status

This repository contains the first working scaffold:

- Cloudflare Worker API for owner email auth, Google Gmail linking, sessions, extension pairing, tracking pixels, link redirects, analytics, and extension sync.
- Static dashboard shell for setup and tracking visibility.
- Chrome Manifest V3 extension for Gmail tracked sends, read summaries, and tracker detection.
- Shared TypeScript package for event types, signing helpers, URL helpers, and detection heuristics.
- D1 migration, Wrangler configs, documentation, and custom non-commercial license.

## Features

- Send individualized tracked Gmail copies so per-recipient read attribution is meaningful.
- Track email opens per message and recipient with signed tracking pixels.
- Track link clicks with signed redirect URLs.
- Show read count and recipient-level reader status in Gmail.
- Detect likely trackers in received Gmail messages.
- Accept one owner email per deployment for dashboard access.
- Send one-time access links and codes to the owner email.
- Keep Gmail linking separate from dashboard access.
- Revoke extension tokens, tune retention/deduplication settings, inspect event timelines, and export CSV analytics.

## How Tracking Works

Who Read Me does not try to identify recipients from one multi-recipient email. That would be inaccurate because every recipient would receive the same tracking markup. Instead, the extension sends one copy per recipient through Gmail API. Each copy has its own signed pixel and recipient-specific tracked links.

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build everything:

   ```bash
   npm run build
   ```

3. Create Cloudflare resources:

   ```bash
   npx wrangler d1 create who-read-me
   npx wrangler r2 bucket create who-read-me-artifacts
   npx wrangler queues create who-read-me-events
   ```

4. Keep the generated D1 ID outside the repository. Put it in a local shell variable or private CI secret named `WRM_D1_DATABASE_ID`.

5. Enable Cloudflare email sending for the Worker and set the owner-auth sender outside the repository:

   ```bash
   npx wrangler secret put AUTH_EMAIL_FROM --config apps/api/wrangler.toml
   ```

6. Create Google OAuth credentials for a web application. Enable Gmail API and include these OAuth scopes:

   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.send`

7. Set these Worker secrets:

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID --config apps/api/wrangler.toml
   npx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/api/wrangler.toml
   npx wrangler secret put SESSION_SECRET --config apps/api/wrangler.toml
   ```

8. Set deployment-only values in your shell or CI secret store, then apply D1 migrations. The helper expects `WRM_D1_DATABASE_ID`, `WRM_APP_ORIGIN`, and `WRM_API_ORIGIN`:

   ```bash
   npm run migrate:api
   ```

9. Deploy the API Worker and dashboard. For the dashboard build, set `API_ORIGIN` in the shell or Pages build environment:

   ```bash
   npm run deploy:api
   npm run deploy:web
   ```

10. Protect the Pages hostname with Cloudflare Access one-time PIN and an allow policy for the same owner email.

11. Load `apps/extension/dist` as an unpacked Chrome extension.

12. Sign in to the dashboard by email, link Gmail, create an extension token, paste it into the extension popup, and set your sender email.

## Deployment Model

The intended public deployment flow is Cloudflare Pages connected to GitHub for the dashboard, plus Wrangler for provisioning and deploying the API Worker resources that Pages depends on.

See [Deployment](docs/DEPLOYMENT.md) for full instructions.

Use [Self-Host Checklist](docs/SELF_HOST_CHECKLIST.md) before relying on a deployment for daily use.

## Accuracy Limits

Email open tracking is inherently approximate. Gmail image proxying, Apple Mail Privacy Protection, enterprise scanners, bot prefetching, blocked remote images, and forwarded messages can all change what an open event means.

See [Privacy](docs/PRIVACY.md) for details.

See [Security](docs/SECURITY.md) for session, token, CSRF, rate-limit, and secret-storage notes.

## License

Who Read Me is distributed under the [Who Read Me Custom License](LICENSE.md). Non-commercial use is allowed. Commercial use is reserved by the copyright holder and requires prior written permission.

This is not an OSI open-source license because it restricts commercial use.
