-- Migration: add attachment_name to consultation_messages
-- Applied automatically on startup via applyMigrationIfMissing.
-- Idempotent — safe to re-run.

ALTER TABLE consultation_messages
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;
