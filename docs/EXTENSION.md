# Chrome Extension

The first extension target is Gmail in Chrome using Manifest V3.

## Responsibilities

- Pair with the owner deployment after email sign-in and Gmail linking.
- Detect Gmail compose windows.
- Ask the API to send individualized tracked copies through Gmail API.
- Avoid Gmail's native send button for tracked messages when there is more than one recipient, because one multi-recipient email cannot provide reliable per-recipient open attribution.
- Show read counts and recipient-level read status in sent/read views.
- Detect likely trackers in received messages.

## Gmail Integration Notes

Gmail is not a stable public extension API. DOM selectors must be isolated in small modules and guarded by feature detection. The extension should fail quietly when Gmail changes and keep the original email content usable.

## Recipient-Level Attribution

Who Read Me sends one tracked copy per recipient. Each copy contains only that recipient's signed pixel and recipient-specific tracked links. This is the only reliable way to answer who opened the message.
