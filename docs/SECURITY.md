# Security

Who Read Me is built for personal self-hosted deployments. Security defaults should protect the owner without adding extra identity systems.

## Authentication

Google OAuth is the only login system. The first Google account that completes setup becomes the owner. Extension tokens are scoped bearer tokens and can be revoked from the dashboard.

## Session Protection

Dashboard sessions use signed HTTP-only cookies. Mutating dashboard requests require an `x-wrm-csrf` header returned by `/api/me`. Extension bearer-token requests do not use cookie CSRF.

## Tracking Endpoints

Tracking pixel and redirect URLs are signed with `SESSION_SECRET`. Tracking endpoints apply per-minute IP rate limits. In local development, event persistence falls back to direct D1 writes if Queue bindings are unavailable.

## Secret Storage

Google refresh tokens are encrypted with AES-GCM using key material derived from `SESSION_SECRET`. Rotating `SESSION_SECRET` invalidates existing sessions, signatures, extension CSRF tokens, and encrypted Gmail refresh tokens.

## Operational Guidance

- Use a long random `SESSION_SECRET`.
- Keep Cloudflare and Google credentials out of the repository.
- Revoke old extension tokens.
- Set a reasonable retention window.
- Treat exported CSV files as sensitive.

