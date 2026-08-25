---
name: Session persistence & payment fixes
description: Critical fixes applied to sessions, payment flow, and knowledge base in this project
---

## Session Persistence (PostgreSQL-backed)
Sessions now stored in `session` table via `connect-pg-simple`. Created manually with:
```sql
CREATE TABLE IF NOT EXISTS session (sid VARCHAR NOT NULL COLLATE "default", sess JSON NOT NULL, expire TIMESTAMP(6) NOT NULL, CONSTRAINT session_pkey PRIMARY KEY (sid));
```
Config in `artifacts/api-server/src/app.ts` — survives server restarts, 7-day TTL.

**Why:** Replit restarts the server periodically; in-memory sessions meant users got logged out.

## Payment Verify — Idempotency + Transaction
`POST /api/payments/verify` now:
1. Returns early if `payment.status === 'paid'` (idempotency guard)
2. Wraps all DB ops in `db.transaction()` for atomicity
3. Uses `sql` increment for coupon usage counter (race-safe)

**Why:** Without guard, double-calling verify created duplicate subscriptions.

## Free Package Flow
`payment.tsx` now shows a dedicated card UI for free packages with a direct call to `POST /api/subscriptions` — bypasses payment form entirely.

**Why:** Free packages went through the full payment form which was confusing and wrong.

## Chat Subscription Query
`chat.ts` now uses `orderBy(desc(subscriptionsTable.id)).limit(1)` to get the most recently created active subscription.

**Why:** After payment, a new active sub is created before the old one is cancelled. Race condition could pick the wrong one.

## Knowledge Base sourceUrl
`GET /admin/knowledge/documents` now includes `sourceUrl` in SELECT. URL-based sources show a clickable link in the admin UI.
