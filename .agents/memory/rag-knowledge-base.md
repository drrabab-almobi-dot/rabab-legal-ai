---
name: RAG Knowledge Base System
description: Details of the RAG pipeline added to RABAB LEGAL AI for admin-uploaded legal documents
---

## Architecture

- **Embedding model:** `text-embedding-3-small` (1536 dims), batched 100 at a time
- **Storage:** `knowledge_documents` + `knowledge_chunks` tables in PostgreSQL; embeddings stored as `jsonb number[]`
- **Similarity:** cosine similarity computed in JS (no pgvector needed)
- **Chunking:** 800-char chunks with 100-char overlap, min 50 chars

## Files Created

- `lib/db/src/schema/knowledge.ts` — Drizzle schema (both tables + documentStatusEnum)
- `artifacts/api-server/src/lib/rag.ts` — chunkText, embedTexts, embedQuery, retrieveRelevantChunks
- `artifacts/api-server/src/routes/knowledge.ts` — admin routes: upload, list, delete, reindex
- `artifacts/rabab-legal/src/pages/admin/knowledge-base.tsx` — admin UI page

## RAG Injection in chat.ts

Before building contextMessages, the code:
1. Reads `OPENAI_API_KEY` directly from env (not from OpenAI instance)
2. Calls `retrieveRelevantChunks(userMessage, apiKey, 5, 0.3)`
3. If chunks found, injects a system message with labeled excerpts
4. RAG failure is caught silently — chat continues without context

**Why:** RAG must never block chat. minSimilarity=0.3 avoids injecting irrelevant content.

## Admin API Routes

- `GET /api/admin/knowledge/documents` — list all docs
- `POST /api/admin/knowledge/upload` — multer memoryStorage, parse PDF/TXT/DOCX, chunk+embed synchronously
- `DELETE /api/admin/knowledge/documents/:id` — cascade deletes chunks via FK
- `POST /api/admin/knowledge/reindex/:id` — re-embed from saved extractedText

## Supported File Types

- PDF via `pdf-parse/lib/pdf-parse.js` (ESM dynamic import)
- DOCX via `mammoth` (dynamic import, no @types)
- TXT via Buffer.toString('utf-8')

## Packages Added to api-server

- `multer` (memoryStorage, 20MB limit)
- `pdf-parse`
- `mammoth`
- `@types/multer`
