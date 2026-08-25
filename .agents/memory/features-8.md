---
name: 8 New Features — July 2026
description: All 8 competitive features added in July 2026 sprint; covers DB tables, API routes, and frontend pages.
---

## Features Added

### 1. PDF Export (consultation.tsx)
- `exportConsultationPDF(area, title, messages)` — opens print window with styled Arabic HTML
- Download button (↓) appears in ChatScreen header when messages exist
- No extra npm dependency (uses browser print API)

### 2. Contract Analysis
- `POST /api/contract/extract` — multer upload, extracts text via pdf-parse/mammoth
- Frontend: paperclip button in chat input → file picker → auto-fills textarea with analysis prompt
- Supports PDF, TXT, DOCX up to 20MB, truncates at 15,000 chars

### 3. Legal Notifications (Alerts)
- DB: `notifications` + `user_notifications` tables (migration applied manually via psql)
- API: `POST/GET /api/admin/notifications`, `POST /:id/publish`, `DELETE /:id`
- API: `GET /api/notifications`, `POST /:id/read`, `POST /read-all`
- Frontend: `NotificationBell` component in Navbar (60s polling, unread count badge)
- Admin page: `/admin/notifications`

### 4. English Language Support
- `LangProvider` + `useLang()` hook in `src/hooks/use-language.tsx`
- Wraps App.tsx; persists to localStorage; toggles HTML dir/lang attributes
- Language toggle button (EN/عر) in Navbar
- Used in Navbar, Pricing, KnowledgeSearch pages; consultation is RTL-only

### 5. Enhanced Legal Categories
- Added 6-country selector (SA, AE, KW, QA, BH, OM) in SetupScreen
- Country flag + name appended to area string when consultation starts
- New area: "تحليل العقود" added to AREAS list

### 6. Enterprise/Institutions Package (UI)
- Enterprise CTA card added to pricing page (`/pricing`)
- Comparison table (toggle) added to pricing showing all 4 plans side-by-side
- No separate DB package — directs to /contact for custom quote
- Pricing update: Questions 149, Monthly 349 (unlimited), Business 699 (unlimited)

### 7. Knowledge Base Search
- `GET /api/admin/knowledge/search?q=` — uses `retrieveRelevantChunks` from rag.ts (requires admin)
- Note: requires admin auth; user search page is at `/knowledge-search` but calls admin endpoint
- If need public search: create a separate authenticated (non-admin) endpoint
- Page: `src/pages/knowledge-search.tsx` — linked from Navbar as "بحث قانوني"

### 8. Audit Log
- DB: `audit_log` table (migration applied via psql)
- Helper: `logAction()` in `src/routes/audit-log.ts` — fire-and-forget, never throws
- Logged events: register, login, payment.verify
- Admin page: `/admin/audit-log` — paginated, searchable, shows user + IP
- Admin sidebar updated with Notifications + Audit Log entries

## Knowledge Search Endpoints
- `GET /api/knowledge/search?q=` — authenticated users (requireAuth), returns 8 chunks
- `GET /api/admin/knowledge/search?q=` — admin only, returns 10 chunks (for admin panel debugging)
