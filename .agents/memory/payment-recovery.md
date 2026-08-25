---
name: Payment Recovery Flow
description: How session loss during Moyasar redirect is handled; recovery endpoint; fixed column names in manual-verify
---

## The Problem
Users who paid via Moyasar and then got redirected back would sometimes see "no active subscription" because:
1. `ProtectedRoute` redirected to `/login` WITHOUT preserving the return URL — after login, user went to `/dashboard`, never completing payment verification
2. `manual-verify` admin endpoint used wrong schema column names (`paymentId`, `startedAt`, `expiresAt`) — these don't exist; correct names are `startDate`, `endDate` (no paymentId column)

## Fixes Applied

### ProtectedRoute → Login → Return
- `protected-route.tsx`: now appends `?returnTo=<encoded_path+querystring>` when redirecting to login
- `login.tsx`: reads `?returnTo`, after successful login uses `window.location.href = BASE_URL + returnTo` (full URL preserved including query string)
- Safety: only internal paths accepted (must start with `/`)

### Recovery Endpoint
`POST /api/payments/recover` (requireAuth):
- If user already has active subscription → returns `{ recovered: false, reason: "already_active" }`
- Finds latest `paid` payment for user → creates active subscription
- Idempotent — safe to call multiple times
- Logged in audit log as `payment.recover`

### Recovery UI on Consultation Page
When `!subscription`, shows "استعادة الاشتراك تلقائياً" button that calls `/payments/recover`.
If `recovered: true` → reloads page. If not → redirects to `/payment/callback`.

### manual-verify Column Fix
The admin endpoint `POST /admin/payments/manual-verify` was inserting with wrong column names. Fixed:
- `startedAt` → `startDate`
- `expiresAt` → `endDate`
- Removed non-existent `paymentId` field
- Added cancellation of existing active subscriptions before insert (same as normal verify flow)

**Why:** Moyasar redirects can lose session cookies in some mobile browsers (iOS Safari ITP, WebView contexts). The ProtectedRoute intercept + returnTo pattern ensures the callback always completes even after re-authentication.
