---
name: Quota & Free Trial System
description: 3-free-services trial per user, then paid subscription with per-service quotas. Server-side enforcement.
---

## Architecture

### DB Tables (added via psql migration July 2026)
- `packages`: added `consultations_allowed`, `contracts_allowed`, `reviews_allowed`, `seats`, `billing_period`, `vat_rate`
- `subscriptions`: added `consultations_used`, `contracts_used`, `reviews_used`, `billing_period_start`
- `service_sessions`: tracks individual service completions with grace-period dedup
- `device_fingerprints`: anti-abuse, links browser hash → user_id

### Core Logic: `artifacts/api-server/src/lib/quota.ts`
- `getQuotaStatus(userId)` → full quota object
- `checkAndReserveService(userId, serviceType, clientSession?)` → reserves session, checks grace period
- `commitService(sessionId)` → marks counted, increments counter in subscription
- FREE_TRIAL_SERVICES = 3 (total across all service types)
- Grace period = 10 min via `clientSession` UUID

### Service Types
- `consultation` — charged at first AI reply in a new consultation session
- `contract_draft` — charged after successful /api/contract/draft response
- `contract_review` — charged after successful /api/contract/review response

### Where Quota is Enforced
- `routes/consultations.ts`: `checkAndReserveService` on POST /consultations
- `routes/chat.ts`: `commitService(reservedSessionId)` after first AI reply
- `routes/contract-analysis.ts`: `checkAndReserveService` + `commitService` in /contract/draft and /contract/review

### Client-Side
- `hooks/useQuota.ts`: fetches `/api/quota/status`, 30s cache, `invalidate()` after service use
- `components/quota-badge.tsx`: visible counter (trial remaining dots OR per-service remaining)
- `components/paywall-screen.tsx`: overlay shown after trial exhausted; previous outputs NOT hidden
- `QuotaBadge` (inline) also exists in consultation.tsx — the import conflict was resolved by removing the duplicate import

### API Routes: `routes/quota.ts`
- `GET /api/quota/status` → public (auth required)
- `POST /api/quota/device-fingerprint` → records fingerprint hash
- `GET /api/admin/conversion-report` → admin conversion funnel + daily charts

### Admin
- `/admin/conversion-report` → ConversionReport page with KPIs, funnel, by-service-type breakdown, daily tables

## Rules
- Admins: always bypass all quota checks
- Trial: 3 TOTAL (sum consultations + contracts + reviews) — not 3 per type
- Paid: per-type quotas per billing period
- After trial exhausted: PaywallScreen shown, previous outputs remain visible/exportable
- Grace period: same `clientSession` UUID within 10 min = same service (no extra charge)
- On trial exhaustion error (code: TRIAL_EXHAUSTED): redirect to /pricing

**Why:** Prevents burning API costs on multi-account abuse while ensuring transparent and trustworthy trial experience.

### Reservation lifecycle concurrency

- Pending reservations are leases: only a strictly live lease may be committed; an expired lease is released and can never be counted later.
- Capacity and liveness use one boundary consistently: `grace_end > NOW()` is live and `grace_end <= NOW()` is expired.
- A same-client grace lookup must happen again **after** the quota lock is acquired. A retry that waited for an in-flight commit must reuse the newly counted grace session rather than reserve another service.
- Trial reservation and completion lock the user before the session; paid work serializes on its subscription before the session.

**Why:** A pre-lock deduplication check is stale under concurrency: completion can occur while a retry waits, otherwise allowing duplicate reservations or double consumption.

**How to apply:** When adding a service flow that reserves or commits quota, use the shared lifecycle helpers and preserve their lock order; add a race test whenever a new code path can retry or commit a reservation.
