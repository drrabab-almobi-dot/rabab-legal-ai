-- Migration: add used_live_search to contract_drafts
-- Run via: psql $DATABASE_URL -f lib/db/src/migrations/add_used_live_search_to_contract_drafts.sql
-- Idempotent — safe to re-run.

ALTER TABLE contract_drafts
  ADD COLUMN IF NOT EXISTS used_live_search BOOLEAN NOT NULL DEFAULT false;
