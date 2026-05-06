# Architecture

Who Read Me is a personal deployment. The owner deploys the repo to Cloudflare, signs in with Google, pairs the Chrome extension, and tracks Gmail messages through their own infrastructure.

## Components

- The Chrome extension modifies Gmail compose content, detects trackers in received messages, and renders read status in sent/read views.
- The API Worker handles Google OAuth, session cookies, extension pairing, signed tracking URLs, analytics APIs, queue consumers, and D1 persistence.
- The dashboard is a Cloudflare Pages site that reads analytics from the API Worker.
- Shared TypeScript code keeps event schemas, signing, and detection rules consistent across the API and extension.

## Data Flow

1. The owner signs in with Google.
2. The owner pairs the extension with the deployment.
3. Gmail compose instrumentation sends tracked copies through the API and Gmail API.
4. The API sends one Gmail message per recipient so recipient-level opens are meaningful.
5. Recipients open the email or click links.
6. Pixel and redirect routes verify signatures, collect metadata, and enqueue events.
7. Queue consumers persist events in D1 and prepare dashboard summaries.
8. Gmail and dashboard clients request per-message analytics.

## Invariants

- The first Google account to complete setup owns the deployment.
- Tracking URLs must be signed and expire only by explicit retention policy.
- Extension tokens are scoped and revocable.
- Received-email tracker detection must never send full email body content to the backend by default.
- Recipient-level read attribution requires individualized sends. A single email with several recipients cannot reliably identify which recipient opened it.
