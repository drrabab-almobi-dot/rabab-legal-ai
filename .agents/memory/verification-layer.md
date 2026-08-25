---
name: Verification Layer
description: Anti-hallucination system for legal AI responses — architecture, integration points, and key rules
---

## What it does
`artifacts/api-server/src/lib/verification.ts` runs after every OpenAI response, before it reaches the client. It:
1. Extracts citation patterns (المادة X, م/Y, التعميم Z, dates)
2. Checks each against retrieved RAG chunks + Tavily results
3. Replaces unverified citations with `[⚠ غير موثق — يُرجى التحقق من laws.boe.gov.sa]`
4. Flags unverified quotations (token overlap < 45%)
5. Computes confidence score (0–100): 40% avg similarity + 35% citation-rate + 25% source-count
6. Returns `{ processedText, summary: { confidence, confidenceScore, blockedCount, sufficientSources, sources[] } }`

## Integration in chat.ts
- `ragChunks` and `webResults` are declared in outer scope BEFORE the try-catch blocks (SourceChunk[] / TavilyResult[])
- `verificationSummary` is declared in outer scope before the OpenAI try-catch, assigned inside
- Response JSON includes `verification: verificationSummary`

## Integration in knowledge.ts legal-research
- After parsing JSON, calls `verifyArticles(articles, chunks, tavilyResults)`
- Returns `verification: { confidence, verifiedArticles, totalArticles, blockedCount, sufficientSources, sources[] }`

## Frontend — consultation.tsx
- `ChatMessage` interface has `verification?: MessageVerification`
- `ConfidenceBadge` component renders below assistant reply bubble
- Shows: level badge (green/amber/red) + insufficiency warning + collapsible sources panel

## Frontend — knowledge-search.tsx
- `LegalArticle` interface has `verified?: boolean, foundIn?: 'kb'|'web'`
- Each article row shows green ✓ (موثق) or amber ⚠ (يحتاج تحقق) badge

## Admin endpoints added to knowledge.ts
- `POST /admin/knowledge/reindex-all` — rebuild all indexed docs from extractedText (fixes bad chunks)
- `GET /admin/knowledge/health` — returns summary + per-doc indexing status

## Key design decisions
**Why:** Dates (هـ / م) are passed through without checking — too many false positives from AI using training-data dates that are correct but not in KB.
**Why:** When chunks.length === 0 AND tavilyResults.length === 0, all citations pass through — can't verify against nothing; `sufficientSources: false` flags this to the UI instead.
**Why:** `verifyArticles` checks both article number presence AND law name presence — either match counts as verified. This avoids false negatives when law is in chunks but exact article number isn't quoted.
