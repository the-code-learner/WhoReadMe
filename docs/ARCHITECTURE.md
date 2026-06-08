# Architecture

Who Read Me is a personal deployment. The owner deploys the repo to Cloudflare, claims the deployment with one email address, links Gmail, pairs the Chrome extension, and tracks Gmail messages through their own infrastructure.

## Components

- The Chrome extension modifies Gmail compose content, detects trackers in received messages, and renders read status in sent/read views.
- The API Worker handles owner email auth, Google Gmail linking, session cookies, extension pairing, signed tracking URLs, analytics APIs, queue consumers, and D1 persistence.
- The dashboard is a Cloudflare Pages site that reads analytics from the API Worker, manages extension tokens, exports CSV events, and stores product settings.
- Shared TypeScript code keeps event schemas, signing, and detection rules consistent across the API and extension.

## Data Flow

1. The owner verifies one deployment email with a one-time link or code.
2. The owner links Gmail with Google OAuth.
3. The owner pairs the extension with the deployment.
4. Gmail compose instrumentation sends tracked copies through the API and Gmail API.
5. The API sends one Gmail message per recipient so recipient-level opens are meaningful.
6. Recipients open the email or click links.
7. Pixel and redirect routes verify signatures, collect metadata, and enqueue events.
8. Queue consumers persist events in D1 and prepare dashboard summaries.
9. Gmail and dashboard clients request per-message analytics.

## Invariants

- The first email address to verify on a fresh deployment owns the deployment.
- A deployment accepts only one owner email for dashboard access.
- Google OAuth links Gmail sending for the owner but does not replace owner email auth.
- Tracking URLs must be signed and expire only by explicit retention policy.
- Extension tokens are scoped and revocable.
- Dashboard cookie mutations must include CSRF protection.
- Tracking events are deduplicated within the configured window.
- Received-email tracker detection must never send full email body content to the backend by default.
- Recipient-level read attribution requires individualized sends. A single email with several recipients cannot reliably identify which recipient opened it.
