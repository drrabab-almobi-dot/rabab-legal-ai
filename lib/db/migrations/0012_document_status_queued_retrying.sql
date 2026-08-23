-- Migration: add queued and retrying values to document_status enum
-- Production already has these values; this migration ensures dev/fresh
-- environments match production so Replit publish does not generate a
-- DROP TYPE that would block deployment.

ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE document_status ADD VALUE IF NOT EXISTS 'retrying';
