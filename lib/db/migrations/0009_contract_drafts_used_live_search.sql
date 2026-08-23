-- Migration 0009: add used_live_search flag to contract_drafts
-- Idempotent: ALTER TABLE ... ADD COLUMN IF NOT EXISTS is safe to run multiple times.
ALTER TABLE contract_drafts
  ADD COLUMN IF NOT EXISTS used_live_search boolean NOT NULL DEFAULT false;
