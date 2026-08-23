-- Migration: add organizations and org_members tables
-- Run via: psql $DATABASE_URL -f lib/db/src/migrations/add_organizations.sql
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  id           SERIAL PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organizations(id),
  user_id      INTEGER REFERENCES users(id),
  email        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | active | removed
  invite_token TEXT UNIQUE,
  invited_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  joined_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id      ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id     ON org_members(user_id)      WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_members_invite_token ON org_members(invite_token) WHERE invite_token IS NOT NULL;

-- Enforce one active membership per user — prevents concurrent join races
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_members_active_user
  ON org_members(user_id)
  WHERE status = 'active' AND user_id IS NOT NULL;

-- Enforce one organization per owner — prevents concurrent create races (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_organizations_owner' AND conrelid = 'organizations'::regclass
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT uq_organizations_owner UNIQUE (owner_id);
  END IF;
END
$$;
