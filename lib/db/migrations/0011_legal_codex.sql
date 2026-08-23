-- 0011: legal_codices + legal_cases — المدونات القضائية الرسمية
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'codex_status') THEN
    CREATE TYPE codex_status AS ENUM ('pending','extracting','ready','error');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS legal_codices (
  id               SERIAL PRIMARY KEY,
  title            TEXT NOT NULL,
  publisher        TEXT,
  court            TEXT,
  year             TEXT,
  total_pages      INTEGER,
  total_cases      INTEGER NOT NULL DEFAULT 0,
  status           codex_status NOT NULL DEFAULT 'pending',
  error_message    TEXT,
  file_data        BYTEA NOT NULL,
  file_size        INTEGER,
  file_hash        TEXT,
  extraction_job_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS legal_codices_file_hash_idx ON legal_codices(file_hash) WHERE file_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS legal_cases (
  id                      SERIAL PRIMARY KEY,
  codex_id                INTEGER NOT NULL REFERENCES legal_codices(id) ON DELETE CASCADE,

  -- Reference metadata
  case_no                 TEXT,
  ruling_no               TEXT,
  ruling_date_hijri       TEXT,
  ruling_date_gregorian   TEXT,
  court                   TEXT,
  circuit                 TEXT,
  litigation_stage        TEXT,
  dispute_subject         TEXT,
  legal_principle         TEXT,
  legal_articles          TEXT[],

  -- Page ranges (dual numbering)
  page_start_file         INTEGER,   -- ترتيب الصفحة في الملف (للعارض)
  page_end_file           INTEGER,
  page_start_printed      TEXT,      -- الرقم المطبوع (للاستشهاد)
  page_end_printed        TEXT,

  -- Extracted content (for search only)
  summary                 TEXT,      -- ملخص
  reasoning               TEXT,      -- التسبيب
  ruling                  TEXT,      -- المنطوق
  raw_text                TEXT,      -- النص الكامل للبحث

  -- Confidence (< 0.5 = "غير متوفر في المستند")
  summary_confidence      REAL DEFAULT 0,
  reasoning_confidence    REAL DEFAULT 0,
  ruling_confidence       REAL DEFAULT 0,

  extraction_error        TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS legal_cases_codex_id_idx   ON legal_cases(codex_id);
CREATE INDEX IF NOT EXISTS legal_cases_court_idx      ON legal_cases(court);
CREATE INDEX IF NOT EXISTS legal_cases_stage_idx      ON legal_cases(litigation_stage);
CREATE INDEX IF NOT EXISTS legal_cases_subject_idx    ON legal_cases(dispute_subject);

-- Full-text search vector
ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS legal_cases_search_idx ON legal_cases USING GIN(search_vector);

-- Auto-update search_vector trigger
CREATE OR REPLACE FUNCTION legal_cases_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('arabic', COALESCE(NEW.dispute_subject,'')), 'A') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.legal_principle,'')), 'A') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.court,'')), 'B') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.circuit,'')), 'B') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.summary,'')), 'C') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.ruling,'')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW.case_no,'')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.ruling_no,'')), 'A') ||
    setweight(to_tsvector('arabic', COALESCE(NEW.raw_text,'')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_cases_search_trigger ON legal_cases;
CREATE TRIGGER legal_cases_search_trigger
  BEFORE INSERT OR UPDATE ON legal_cases
  FOR EACH ROW EXECUTE FUNCTION legal_cases_search_update();
