# Privacy and Accuracy

Who Read Me is a power-user analytics tool. The owner is responsible for lawful and ethical use in their jurisdiction.

## Data Collected

Tracking events may include:

- Message ID and recipient ID.
- Event type.
- Timestamp.
- User agent.
- Referrer when available.
- Coarse location metadata provided by Cloudflare.
- Bot or scanner hints.

The extension should not upload full received email bodies for tracker detection. Local deterministic rules run first.

## Accuracy Limits

Open tracking does not prove that a human read an email. Common distortions include:

- Gmail image proxying.
- Apple Mail Privacy Protection.
- Corporate mail scanners.
- Security bots and link prefetchers.
- Remote image blocking.
- Forwarded emails.

Dashboard labels should use careful language such as "open event" and "likely read" where appropriate.

## Retention

Retention should be configurable per deployment. The first scaffold stores events indefinitely until retention workflows are implemented.

