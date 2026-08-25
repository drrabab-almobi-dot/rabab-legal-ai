---
name: Arabic Text Quality Fix
description: How reversed Arabic PDF text is detected, fixed, and blocked from RAG results; admin quality dashboard
---

## The Problem
`pdf-parse` extracts Arabic PDFs in visual (LTR/right-to-left-reversed) order, producing nonsensical character sequences. Dates like `9272هـ` are hijri years reversed. This polluted RAG chunks and degraded search quality.

## The Fix — Three Layers

### Layer 1: Extraction (document-indexer.ts)
`extractPdf()` now calls `preprocessExtractedText(rawText)` from `arabic-text-fix.ts` immediately after `pdf-parse` returns. This:
- Detects reversed Arabic text via `isReversedArabic()` (checks character ordering heuristics)
- Reverses the text back to logical order if reversed
- Normalizes Arabic-Indic numerals (٠١٢٣ → 0123)
- Logs a warning with char count when direction fix was applied

### Layer 2: Quality Gate (rag.ts)
- `isCorruptedChunk()` now delegates to `assessChunkQuality()` from `arabic-text-fix.ts` instead of its own simple heuristic
- `checkChunkQuality()` exported for admin use — returns `{ passed, score, reasons, category }`
- `minSimilarity` raised from `0.3` → `0.42` (default) to reduce low-relevance results
- Keyword-match bypass now also requires `semScore >= 0.25` to prevent irrelevant number matches

### Layer 3: Admin Dashboard (/admin/knowledge-quality)
- `GET /api/admin/knowledge/quality-scan` — scans ALL stored chunks, returns summary + per-document breakdown + list of blocked chunks (capped at 200)
- `DELETE /api/admin/knowledge/blocked-chunks/:documentId` — deletes chunks that fail quality check for a specific document, updates `totalChunks`
- Frontend at `/admin/knowledge-quality` — shows health %, per-doc scoreBar, blocked chunks with snippets, filter by failure category, delete buttons
- Sidebar link added (ShieldCheck icon)

## Key Files
- `artifacts/api-server/src/lib/arabic-text-fix.ts` — core logic (already existed, now integrated)
- `artifacts/api-server/src/lib/document-indexer.ts` — calls `preprocessExtractedText` in `extractPdf()`
- `artifacts/api-server/src/lib/rag.ts` — imports `assessChunkQuality`, raised threshold
- `artifacts/api-server/src/routes/knowledge.ts` — two new admin endpoints
- `artifacts/rabab-legal/src/pages/admin/knowledge-quality.tsx` — admin UI

## Admin Workflow After Deploy
1. Go to /admin/knowledge-quality → Run Scan
2. Review per-document health scores
3. For each bad document: delete blocked chunks → go to knowledge-base → re-index
4. Re-run scan to confirm clean

**Why:** Silent data corruption (reversed text) was producing low-confidence or hallucinated RAG results because the embedding model couldn't match reversed strings to user queries.
