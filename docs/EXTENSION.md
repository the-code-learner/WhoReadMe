# Chrome Extension

The first extension target is Gmail in Chrome using Manifest V3.

## Responsibilities

- Pair with the owner deployment after Google sign-in.
- Detect Gmail compose windows.
- Ask the API to prepare a tracked message.
- Inject per-recipient tracking pixels.
- Rewrite links through signed redirect URLs.
- Show read counts and recipient-level read status in sent/read views.
- Detect likely trackers in received messages.

## Gmail Integration Notes

Gmail is not a stable public extension API. DOM selectors must be isolated in small modules and guarded by feature detection. The extension should fail quietly when Gmail changes and keep the original email content usable.

