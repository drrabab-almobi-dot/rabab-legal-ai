-- Migration 0002: Add sources column to consultation_messages
-- Persists RAG verification sources for admin review on assistant messages.
-- Applied automatically at server startup via the readiness check in api-server/src/index.ts.
-- Can also be applied manually: psql $DATABASE_URL < lib/db/migrations/0002_consultation_messages_sources.sql

ALTER TABLE consultation_messages
  ADD COLUMN IF NOT EXISTS sources jsonb;
