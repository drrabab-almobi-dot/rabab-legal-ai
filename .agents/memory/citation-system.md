---
name: Legal Citation System
description: Page tracking + case metadata extraction + CitationCard UI for judicial search results
---

## What was built

Full legal citation system for judicial documents in RAG knowledge base.

## DB columns added (via psql ALTER TABLE — NOT drizzle push to avoid session table conflict)
- `knowledge_chunks.page_start integer` (nullable)
- `knowledge_chunks.page_end integer` (nullable)
- `knowledge_documents.case_metadata jsonb` (nullable)

**Why:** drizzle-kit push in non-TTY shell fails if any data-loss statement exists (e.g. session table). Use `psql "$DATABASE_URL" -c "ALTER TABLE ..."` directly for additive column migrations.

## Key components

### document-indexer.ts
- `extractPdfWithPages(buffer)` — uses pdf-parse `pagerender` callback to capture per-page text; returns `{ text, pageBoundaries: { pageNum, startChar, endChar }[] }`. Page number from `pageData.pageNumber` (PDF.js 1-based). Pages sorted after Promise.all since async order isn't guaranteed.
- `getChunkPages(content, fullText, boundaries)` — matches first 80 chars of chunk in fullText, maps to page.
- `extractCaseMetadata(text, filename)` — GPT-4o-mini structured JSON extraction. Low-confidence fields set to null. Non-blocking fire-and-forget in indexDocument.
- `indexDocument()` — now passes `pageStart`/`pageEnd` with each chunk insert; triggers metadata extraction for judicial docs.

### rag.ts
- `RelevantChunk` extended with `documentId`, `pageStart`, `pageEnd`, `caseMetadata`.
- `retrieveRelevantChunks` selects these from DB and returns them.

### knowledge.ts (routes)
- `GET /knowledge/search` — now accepts `court`, `stage`, `year`, `subject` query params; applies post-retrieval filtering on caseMetadata. Includes `expandLawyerQuery()` for case number / article ref queries.
- `GET /documents/:id/view` — serves raw PDF with `Content-Disposition: inline` for browser `#page=N` anchor.
- `GET /admin/knowledge/citation-stats` — returns per-doc extraction status for judicial docs.
- `POST /admin/knowledge/extract-metadata/:docId` — triggers AI extraction for one doc.

### knowledge-search.tsx
- `CitationCard` component — shows court, stage, case/ruling number, date, page. "نسخ الاستشهاد" + "فتح عند ص N" buttons.
- Filter panel (collapsed by default) for court name + litigation stage on judicial tab.
- استئناس notice: "السوابق القضائية للاستئناس لا للإلزام" shown on judicial results.

### admin/knowledge-quality.tsx
- Added citation metadata section — shows % completion, per-doc status, "استخراج" button for docs without metadata.

## Re-indexing required
Existing documents have `pageStart = null`. They need re-indexing to gain page numbers. Admins can trigger metadata extraction separately via the admin page without re-indexing (extracts from already-stored `extractedText`).
