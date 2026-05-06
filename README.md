# Who Read Me

Who Read Me is a self-hostable email tracking and tracker-detection product for Gmail. It combines a Chrome extension with Cloudflare infrastructure so an individual user can deploy their own private instance.

The project is designed around Cloudflare Pages, Workers, D1, R2, Queues, Workflows, Workers AI, and GitHub-connected deployments. Google OAuth is used both for Gmail linking and dashboard access.

## Current Status

This repository contains the first working scaffold:

- Cloudflare Worker API for Google OAuth, sessions, extension pairing, tracking pixels, link redirects, analytics, and extension sync.
- Static dashboard shell for setup and tracking visibility.
- Chrome Manifest V3 extension starter for Gmail compose/read instrumentation and tracker detection.
- Shared TypeScript package for event types, signing helpers, URL helpers, and detection heuristics.
- D1 migration, Wrangler configs, documentation, and custom non-commercial license.

## Features

- Send individualized tracked Gmail copies so per-recipient read attribution is meaningful.
- Track email opens per message and recipient with signed tracking pixels.
- Track link clicks with signed redirect URLs.
- Show read count and recipient-level reader status in Gmail.
- Detect likely trackers in received Gmail messages.
- Use Google OAuth as the single identity system.
- Keep each deployment autonomous and owned by the first Google account that completes setup.

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

4. Copy the generated resource IDs into `apps/api/wrangler.toml`.

5. Create Google OAuth credentials for a web application. Enable Gmail API and include these OAuth scopes:

   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.send`

6. Set these Worker secrets:

   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID --config apps/api/wrangler.toml
   npx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/api/wrangler.toml
   npx wrangler secret put SESSION_SECRET --config apps/api/wrangler.toml
   ```

7. Apply D1 migrations:

   ```bash
   npx wrangler d1 migrations apply who-read-me --config apps/api/wrangler.toml
   ```

8. Deploy the API Worker and dashboard:

   ```bash
   npm run deploy:api
   npm run build:web
   ```

9. Load `apps/extension/dist` as an unpacked Chrome extension.

10. Sign in to the dashboard, create an extension token, paste it into the extension popup, and set your sender email.

## Deployment Model

The intended public deployment flow is Cloudflare Pages connected to GitHub for the dashboard, plus Wrangler for provisioning and deploying the API Worker resources that Pages depends on.

See [Deployment](docs/DEPLOYMENT.md) for full instructions.

## Accuracy Limits

Email open tracking is inherently approximate. Gmail image proxying, Apple Mail Privacy Protection, enterprise scanners, bot prefetching, blocked remote images, and forwarded messages can all change what an open event means.

See [Privacy](docs/PRIVACY.md) for details.

## License

Who Read Me is distributed under the [Who Read Me Custom License](LICENSE.md). Non-commercial use is allowed. Commercial use is reserved by the copyright holder and requires prior written permission.

This is not an OSI open-source license because it restricts commercial use.
