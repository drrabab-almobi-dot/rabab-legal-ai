import { pool } from "@workspace/db";

export interface SqlExecutor {
  query(sql: string): Promise<unknown>;
}

export const CRITICAL_SCHEMA_STATEMENTS = [
  `ALTER TABLE consultation_messages
     ADD COLUMN IF NOT EXISTS sources jsonb`,
  `ALTER TABLE consultation_messages
     ADD COLUMN IF NOT EXISTS used_live_search boolean NOT NULL DEFAULT false`,
  `ALTER TABLE consultation_messages
     ADD COLUMN IF NOT EXISTS attachment_name text`,
  `ALTER TABLE consultations
     ADD COLUMN IF NOT EXISTS service_session_id integer
     REFERENCES service_sessions(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS consultations_service_session_idx
     ON consultations(service_session_id)
     WHERE service_session_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS service_sessions_pending_expiry_idx
     ON service_sessions(grace_end)
     WHERE counted = false`,
] as const;

let readinessPromise: Promise<void> | null = null;

export async function applyCriticalSchema(
  executor: SqlExecutor = pool,
): Promise<void> {
  await executor.query(`${CRITICAL_SCHEMA_STATEMENTS.join(";\n")};`);
}

export function ensureCriticalSchema(
  executor: SqlExecutor = pool,
): Promise<void> {
  readinessPromise ??= applyCriticalSchema(executor).catch((error) => {
    readinessPromise = null;
    throw error;
  });
  return readinessPromise;
}

export function resetCriticalSchemaReadinessForTests(): void {
  readinessPromise = null;
}
