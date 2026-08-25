---
name: Platform Section Control
description: Feature flag system for hiding/showing portal sections (judicial, circulars, legal blog) with quality gate enforcement.
---

## Architecture

- DB table: `platform_settings` (key/value jsonb) — row `section_visibility`
- Schema: `lib/db/src/schema/platform-settings.ts` exports `SectionVisibilitySettings`, `DEFAULT_SECTION_VISIBILITY`
- Backend route: `artifacts/api-server/src/routes/platform-settings.ts`
  - `GET /api/platform-settings` — public (frontend reads flags)
  - `GET/PUT /api/admin/platform-settings` — admin CRUD
  - `GET /api/admin/section-quality` — per-category quality metrics
  - In-memory cache 5 min TTL, `invalidateCache()` on PUT
- Admin UI: `artifacts/rabab-legal/src/pages/admin/section-control.tsx` at `/admin/section-control`

## Current Default State (set in DB)
- showJudicial: **false** (hidden)
- showCirculars: **false** (hidden)
- showLegalBlog: **false** (hidden)
- showRegulations: **true** (visible)
- Quality thresholds: judicial=80%, circular=75%, legal_blog=80%

## Source Restriction in Chat
`artifacts/api-server/src/routes/chat.ts` reads `getSectionVisibility()` on every request.
- Hidden sections → adds category to `excludeCategories` → RAG `retrieveRelevantChunks` skips those docs
- Injects mandatory system message forbidding citations from hidden sections
- Only source: `laws.boe.gov.sa` or verified KB docs

**Why:** Prevents model from hallucinating judicial precedents/circulars that aren't retrievable and couldn't be verified.

## RAG Change
`artifacts/api-server/src/lib/rag.ts`: added `excludeCategories?: string[]` to `opts` param.
Uses `sql\`NOT IN (...)\`` in the WHERE clause of the knowledge_chunks query.

## UI Changes
- `legal-assistant.tsx`: Only 2 cards — صياغة العقود (primary) + الاستشارات القانونية
- Navbar: replaced "الباحث القانوني" with "الاستشارات القانونية" → /consultation
- Footer: same change
- Home page: feature chips updated to remove judicial/circulars references
- Admin sidebar: added "تحكم الأقسام" → /admin/section-control

## How to Re-enable a Section
1. Go to /admin/section-control
2. Section quality must exceed threshold (judicial≥80%, circular≥75%)
3. Toggle → Save → cache clears automatically
