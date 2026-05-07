# Self-Host Checklist

Use this checklist before treating a deployment as ready for daily use.

## Cloudflare

- D1 database created and `database_id` copied into `apps/api/wrangler.toml`.
- R2 bucket created.
- Queue created.
- Worker deployed successfully.
- Pages project connected to GitHub.
- `APP_ORIGIN` points to the dashboard origin.
- `API_ORIGIN` points to the Worker origin.
- Custom domains and DNS records are configured if needed.

## Google

- Gmail API is enabled.
- OAuth consent screen is configured.
- OAuth client has the production callback URL.
- Scopes include `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/gmail.send`.
- Test user can sign in and grant Gmail send permission.

## Product

- Dashboard sign-in works.
- Extension token can be created and revoked.
- Extension popup has API origin, extension token, sender email, and tracker warning preference.
- A Gmail compose window shows `Send tracked copies`.
- One tracked copy is sent per recipient.
- Dashboard shows message, recipient, open/click, and event rows.
- CSV export downloads successfully.
- Settings save successfully.

## Safety

- `SESSION_SECRET` is long and random.
- Extension tokens are revoked when no longer used.
- Retention period is set to the smallest practical value.
- Users understand that open events are approximate and can be triggered by proxies or scanners.

