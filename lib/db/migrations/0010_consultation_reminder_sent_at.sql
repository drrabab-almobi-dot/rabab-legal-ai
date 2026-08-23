-- Migration: add reminder_sent_at to consultations
-- Tracks when a pending-consultation reminder was sent so the scheduler
-- survives server restarts without re-sending to the same user.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;
