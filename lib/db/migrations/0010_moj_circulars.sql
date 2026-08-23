-- Migration 0010: moj_circulars table
-- MOJ Official Circulars fetched from portaleservices.moj.gov.sa/TameemPortal/
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS moj_circulars (
  id               SERIAL PRIMARY KEY,
  tameem_id        INTEGER UNIQUE NOT NULL,
  tameem_no        TEXT    NOT NULL DEFAULT '',
  hdate            TEXT    NOT NULL DEFAULT '',
  hdate_year       TEXT    NOT NULL DEFAULT '',
  subject          TEXT    NOT NULL DEFAULT '',
  body_text        TEXT    NOT NULL DEFAULT '',
  source_url       TEXT    NOT NULL DEFAULT '',
  status           TEXT    NOT NULL DEFAULT 'غير محدد',
  related_tameem_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  original_image_data BYTEA,
  original_image_mime TEXT,
  doc_id           INTEGER,
  fetched_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS moj_circulars_hdate_year_idx ON moj_circulars (hdate_year);
CREATE INDEX IF NOT EXISTS moj_circulars_status_idx ON moj_circulars (status);
CREATE INDEX IF NOT EXISTS moj_circulars_tameem_id_desc_idx ON moj_circulars (tameem_id DESC);
