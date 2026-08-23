-- Migration: add email_verified column to users table
-- The Drizzle schema defines this column (default true) but it was not
-- included in any earlier migration file.  Applying it here ensures future
-- fresh deployments and CI environments start with the column present so
-- auth routes that SELECT * from users do not error.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT true;
