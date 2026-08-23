-- Migration: enforce at most one uncounted service_session per (user_id, service_type, client_session)
-- when a client_session UUID is present.
--
-- This prevents duplicate quota slots from piling up when the same consultation-creation
-- request is retried rapidly (user double-clicks, network blip, etc.). Each unique
-- client-generated UUID represents one intended operation; the constraint serialises
-- concurrent DB inserts that carry the same UUID so only one pending session survives.
--
-- Scope: client_session IS NOT NULL only — anonymous reservations (no UUID provided)
-- are unaffected, and users can legitimately have multiple consultations pending at
-- once as long as each carries a distinct UUID.
--
-- Step 1: drop the overly-broad index from any earlier migration run that used
--         (user_id, service_type) without client_session (safe no-op if absent).
DROP INDEX IF EXISTS uq_service_sessions_pending;

-- Step 2: remove any pre-existing duplicates within (user_id, service_type, client_session)
--         keeping the newest row so the CREATE below never fails.
DELETE FROM service_sessions
WHERE client_session IS NOT NULL
  AND NOT counted
  AND id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY user_id, service_type, client_session
               ORDER BY id DESC   -- keep newest
             ) AS rn
      FROM service_sessions
      WHERE client_session IS NOT NULL AND NOT counted
    ) ranked
    WHERE rn > 1
  );

-- Step 3: create the narrowly-scoped partial unique index (IF NOT EXISTS — safe to re-run).
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_sessions_pending_client
  ON service_sessions (user_id, service_type, client_session)
  WHERE NOT counted AND client_session IS NOT NULL;
