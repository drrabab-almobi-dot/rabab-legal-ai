-- A reservation can pay for at most one consultation. NULL remains allowed for
-- legacy/admin rows because PostgreSQL unique constraints permit multiple NULLs.
UPDATE consultations
SET service_session_id = NULL
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY service_session_id
      ORDER BY id ASC
    ) AS row_number
    FROM consultations
    WHERE service_session_id IS NOT NULL
  ) duplicates
  WHERE row_number > 1
);

ALTER TABLE consultations
  ADD CONSTRAINT consultations_service_session_unique UNIQUE (service_session_id);