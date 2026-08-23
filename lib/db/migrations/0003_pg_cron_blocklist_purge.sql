-- OPTIONAL / MANUAL script — do NOT apply automatically via applyMigrationIfMissing.
--
-- This script installs a pg_cron job that purges expired token_blocklist rows
-- every hour directly inside PostgreSQL, with no dependency on the Node.js
-- process.  It requires pg_cron to be pre-loaded in postgresql.conf:
--
--   shared_preload_libraries = 'pg_cron'
--   cron.database_name = '<your-db-name>'
--
-- In the current Replit-managed PostgreSQL instance pg_cron is NOT in
-- shared_preload_libraries (only timescaledb,helium are loaded), so this
-- script cannot be applied here.  The Node.js server uses a recursive-
-- setTimeout fallback instead (see artifacts/api-server/src/index.ts).
--
-- If pg_cron ever becomes available, run this script once as a superuser and
-- then remove the setTimeout block from index.ts.
-- ──────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any pre-existing schedule with the same name (idempotent).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'purge-expired-blocklist';

-- Run every hour on the hour.
-- The btree index idx_token_blocklist_expires_at makes this a fast range seek.
SELECT cron.schedule(
  'purge-expired-blocklist',
  '0 * * * *',
  $$DELETE FROM token_blocklist WHERE expires_at < NOW()$$
);
