-- Migration: add token_version column to users table
-- Used to invalidate all outstanding JWTs when an admin re-enables a previously
-- disabled account.  The column starts at 1 for every row (existing and new);
-- any JWT that embeds a lower tokenVersion will be rejected by the auth middleware.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1;
