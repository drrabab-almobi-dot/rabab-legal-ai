-- Bind a consultation to the exact pending service reservation that paid for it.
-- Deleting an abandoned reservation clears the link so the consultation can
-- safely reserve a new slot when the user returns.
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS service_session_id integer
  REFERENCES service_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS consultations_service_session_idx
  ON consultations(service_session_id)
  WHERE service_session_id IS NOT NULL;

-- Pending rows are temporary capacity reservations and are reaped by the API.
CREATE INDEX IF NOT EXISTS service_sessions_pending_expiry_idx
  ON service_sessions(grace_end)
  WHERE counted = false;