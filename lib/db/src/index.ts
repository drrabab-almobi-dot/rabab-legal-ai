import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function normalizeDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    // Historical Vercel config accidentally used the literal host "base".
    // Preserve credentials/database name while correcting only the known-bad host
    // to the verified Supabase Session Pooler endpoint for this project.
    if (url.hostname === "base") {
      url.hostname = "aws-0-ap-south-1.pooler.supabase.com";
      url.port = "5432";
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const effectiveDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: effectiveDatabaseUrl,
  // Never let an unreachable Supabase endpoint hang startup forever.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
