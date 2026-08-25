---
name: Password reset links in preview
description: Reset emails requested from development must point back to the active preview, not the production domain.
---

In development, password-reset URLs must use the forwarded request origin ahead of any production `FRONTEND_URL`; production continues to use the configured public frontend URL.

**Why:** A development environment can retain the official domain in configuration even while that domain is not published. Sending a reset link there makes account recovery appear broken and takes users to Replit's private-app page.

**How to apply:** For email actions that return users to the web app, derive a proxied preview origin from the request only in development. Never let a request-controlled host choose the public production destination.