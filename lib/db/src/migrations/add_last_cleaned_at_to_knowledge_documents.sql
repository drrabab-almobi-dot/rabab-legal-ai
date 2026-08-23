-- Migration: track cleanup history on knowledge_documents
-- Run via: psql $DATABASE_URL -f lib/db/src/migrations/add_last_cleaned_at_to_knowledge_documents.sql
-- All statements are idempotent — safe to re-run.

-- 1. Timestamp of the most recent corrupt-caseMetadata cleanup for each document
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS last_cleaned_at timestamptz;

-- 2. Running count of how many times a document has had its caseMetadata wiped
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS clean_count integer NOT NULL DEFAULT 0;

SELECT 'add_last_cleaned_at_to_knowledge_documents migration complete' AS status;
