---
name: Moyasar Payment Integration
description: Real Moyasar sandbox integration — flow, secrets, and key implementation decisions
---

## Secrets Required
- `MOYASAR_SECRET_KEY` = `sk_test_...` — backend only (verify payments via API)
- `MOYASAR_PUBLISHABLE_KEY` = `pk_test_...` — exposed to frontend via Vite `define`

## Vite Config
`import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY` is injected via `define` in `vite.config.ts`:
```ts
define: {
  'import.meta.env.VITE_MOYASAR_PUBLISHABLE_KEY': JSON.stringify(process.env.MOYASAR_PUBLISHABLE_KEY ?? ''),
}
```
**Why:** Vite only exposes env vars with `VITE_` prefix, but Replit secrets don't support that prefix directly. The `define` block bridges the gap at build/dev time.

## Payment Flow (with real key)
1. User fills billing form on `/payment?packageId=X`
2. Submit → `POST /api/payments/initiate` → returns `paymentId` (stored in our DB as `pending`)
3. Frontend detects `MOYASAR_PUB_KEY` is set → enters `moyasarStep`
4. Stores `paymentId` in `sessionStorage('moyasar_local_payment_id')`
5. Loads `moyasar.js` + CSS from CDN dynamically
6. `Moyasar.init()` renders card form (creditcard + stcpay)
7. User pays → Moyasar redirects to `/payment/callback?id=<moyasar_id>&status=paid|failed`
8. Callback page reads `moyasar_id` from URL + `localPaymentId` from sessionStorage
9. Calls `POST /api/payments/verify` with `{ paymentId, gatewayRef: moyasar_id }`
10. Backend calls `GET https://api.moyasar.com/v1/payments/:moyasar_id` to verify status + amount
11. If valid → atomic DB transaction (mark paid + invoice + subscription) → redirect to success

## Payment Flow (no key — sandbox simulation)
- If `MOYASAR_PUBLISHABLE_KEY` is empty, falls back to immediate verify without Moyasar (SIM- prefix gatewayRef)
- Backend skips Moyasar API verification when `gatewayRef` starts with `SIM-`

## Amount Validation
- Backend converts totalAmount (SAR) → halalas (× 100) and compares with Moyasar's returned `amount`
- Mismatch → 400 error

## New Files
- `artifacts/rabab-legal/src/pages/payment-callback.tsx` — handles Moyasar redirect
- Route: `/payment/callback` added to App.tsx (ProtectedRoute)

## CDN URLs
- JS: `https://cdn.moyasar.com/mpf/1.14.0/moyasar.js`
- CSS: `https://cdn.moyasar.com/mpf/1.14.0/moyasar.css`
