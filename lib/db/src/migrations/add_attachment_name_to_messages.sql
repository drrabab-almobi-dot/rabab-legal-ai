-- Migration: add attachment_name to consultation_messages
-- Run via: psql $DATABASE_URL -f lib/db/src/migrations/add_attachment_name_to_messages.sql
-- Idempotent — safe to re-run.

ALTER TABLE consultation_messages
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;
