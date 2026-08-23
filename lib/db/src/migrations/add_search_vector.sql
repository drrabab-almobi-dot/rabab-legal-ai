-- Migration: add full-text search vector to knowledge_chunks
-- Run via: psql $DATABASE_URL -f lib/db/src/migrations/add_search_vector.sql
-- All statements are idempotent — safe to re-run.

-- 1. Add the tsvector column (no-op if already exists)
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Trigger function: rebuild search_vector on insert / content update.
--    Uses the 'simple' dictionary (no stemming) — Arabic words are indexed as-is.
--    Arabic-Indic digit normalisation is handled in the application layer before
--    passing the query to tsquery, so we do not need to transform at index time.
CREATE OR REPLACE FUNCTION knowledge_chunks_tsv_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;

-- 3. Attach trigger (BEFORE INSERT OR UPDATE OF content)
DROP TRIGGER IF EXISTS trig_knowledge_chunks_tsv ON knowledge_chunks;
CREATE TRIGGER trig_knowledge_chunks_tsv
  BEFORE INSERT OR UPDATE OF content
  ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION knowledge_chunks_tsv_update();

-- 4. Backfill existing rows
UPDATE knowledge_chunks
   SET search_vector = to_tsvector('simple', coalesce(content, ''))
 WHERE search_vector IS NULL;

-- 5. GIN index for fast @@ queries
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector
  ON knowledge_chunks USING GIN (search_vector);

SELECT 'search_vector migration complete' AS status;
