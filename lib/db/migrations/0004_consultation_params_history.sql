-- Migration: create consultation_params_history audit table
CREATE TABLE IF NOT EXISTS consultation_params_history (
  id serial PRIMARY KEY,
  consultation_id integer NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  old_params jsonb,
  new_params jsonb,
  updated_by integer,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cph_consultation_id ON consultation_params_history(consultation_id);
