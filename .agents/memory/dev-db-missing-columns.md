---
name: Dev DB Missing Columns
description: Columns missing from dev DB after schema changes — must be added manually after each merge that touches the knowledge schema
---

# Dev DB Missing Columns

## Rule
After any task merge that touches `lib/db/src/schema/`, run a manual psql migration for each new column — drizzle push does NOT auto-apply in dev.

**Why:** The dev DB is out of sync with Drizzle schema. Each task agent adds schema columns but doesn't migrate the running dev DB.

## Columns added manually (Aug 2026)

### `session` table
```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```
Note: table name is `"session"` (singular) — connect-pg-simple expects this exact name.

### `consultations` table
```sql
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;
```

### `knowledge_documents` table
```sql
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS last_cleaned_at TIMESTAMP;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS clean_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS structured_data JSONB;
```

### `knowledge_chunks` table
```sql
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector;
```

## How to apply
Run each `ALTER TABLE` via psql against `$DATABASE_URL`. The `knowledge_chunks.search_vector` column is populated by a DB trigger (see `migrations/add_search_vector.sql`).

## Reindexing after column fix
After adding missing columns, reset failed docs and trigger reindex:
```sql
UPDATE knowledge_documents SET status='pending', error_message=NULL
WHERE status='error' AND error_message LIKE 'Failed query%';
```
Then POST /api/admin/knowledge/reindex-all (requires admin token).
