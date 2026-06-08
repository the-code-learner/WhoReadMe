# Security

Who Read Me is built for personal self-hosted deployments. Security defaults should protect the owner while keeping deployment ownership explicit.

## Authentication

Dashboard access uses one-time email links or six-digit one-time codes. The first email that successfully verifies on a new deployment becomes the owner, and later access attempts only send email to that owner address. Google OAuth is used after owner sign-in to link Gmail sending, not to authorize dashboard access.

Cloudflare Pages should also be protected by Cloudflare Access with One-time PIN and an Allow policy containing only the owner email. The owner email must stay in Cloudflare configuration, not in the repository.

Extension tokens are scoped bearer tokens and can be revoked from the dashboard.

## Session Protection

Dashboard sessions use signed HTTP-only cookies. Mutating dashboard requests require an `x-wrm-csrf` header returned by `/api/me`. Extension bearer-token requests do not use cookie CSRF.

One-time access challenges expire after 10 minutes, are stored hashed in D1, and are marked consumed after use.

## Tracking Endpoints

Tracking pixel and redirect URLs are signed with `SESSION_SECRET`. Tracking endpoints apply per-minute IP rate limits. In local development, event persistence falls back to direct D1 writes if Queue bindings are unavailable.

## Secret Storage

Google refresh tokens are encrypted with AES-GCM using key material derived from `SESSION_SECRET`. Rotating `SESSION_SECRET` invalidates existing sessions, pending access challenges, signatures, extension CSRF tokens, and encrypted Gmail refresh tokens.

## Operational Guidance

- Use a long random `SESSION_SECRET`.
- Keep Cloudflare and Google credentials out of the repository.
- Keep owner emails, sender emails, local absolute paths, and account identifiers out of tracked files.
- Run `npm run privacy:scan` before committing deployment changes.
- Revoke old extension tokens.
- Set a reasonable retention window.
- Treat exported CSV files as sensitive.
