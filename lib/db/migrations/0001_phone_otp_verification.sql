-- Migration 0001: Phone OTP Verification
-- Adds phone verification support to the users table and creates the OTP tokens table.
-- Applied automatically at server startup via the readiness check in api-server/src/index.ts.
-- Can also be applied manually: psql $DATABASE_URL < lib/db/migrations/0001_phone_otp_verification.sql

-- 1. Add phone_verified column to users (idempotent)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

-- 2. Create OTP tokens table (idempotent)
CREATE TABLE IF NOT EXISTS phone_otp_tokens (
  id          serial       PRIMARY KEY,
  user_id     integer      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verify_token text        NOT NULL UNIQUE,
  code        text         NOT NULL,
  expires_at  timestamp    NOT NULL,
  used_at     timestamp,
  attempts    integer      NOT NULL DEFAULT 0,
  created_at  timestamp    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_otp_verify_token ON phone_otp_tokens(verify_token);
CREATE INDEX IF NOT EXISTS idx_phone_otp_user_id      ON phone_otp_tokens(user_id);
