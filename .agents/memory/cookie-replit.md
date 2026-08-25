---
name: Cookie config for Replit
description: Session cookie settings required for auth to work in Replit's HTTPS proxy environment
---

## Rule
In `artifacts/api-server/src/app.ts`:
- `app.set("trust proxy", 1)` — must be first, before session middleware
- Cookie: `secure: true`, `sameSite: "none"` when `REPL_ID` env var is present OR `NODE_ENV === "production"`
- Detection: `const isReplitOrProd = !!process.env.REPL_ID || process.env.NODE_ENV === "production"`

**Why:** Replit serves everything over HTTPS through a reverse proxy even in development. Without `trust proxy`, Express doesn't trust the X-Forwarded headers. Without `sameSite: "none"`, cookies are blocked in the Replit iframe preview (cross-origin sub-requests). Without `secure: true`, the Secure flag isn't set, which breaks `sameSite: "none"` (browsers require Secure for sameSite=none).

**How to apply:** Any time the session or cookie config is modified in app.ts, preserve these settings.
