import { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { db, usersTable, tokenBlocklistTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
    }
  }
}

// ── Security fix: never fall back to a hardcoded secret ──────────────────────
// The JWT signing key MUST come from the environment. A hardcoded fallback
// would allow any attacker who reads the source code to forge valid tokens.
const _jwtSecret = process.env.SESSION_SECRET;
if (!_jwtSecret) {
  console.error(
    "FATAL: SESSION_SECRET environment variable is required for JWT signing. " +
    "Set it to a cryptographically random string (≥ 64 characters)."
  );
  process.exit(1);
}
export const JWT_SECRET: string = _jwtSecret;

export interface JwtPayload {
  userId: number;
  userRole: string;
  jti?: string;
  /** Token-generation counter embedded at login time.  Checked against the DB
   *  value on every authenticated request; a mismatch (e.g. after admin re-enable)
   *  rejects the token and forces a fresh login. */
  tokenVersion?: number;
}

/** SHA-256 hex fingerprint of the raw token string (used as the blocklist key). */
export function tokenFingerprint(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Returns true if the token fingerprint is in the blocklist. */
async function isTokenRevoked(rawToken: string): Promise<boolean> {
  const key = tokenFingerprint(rawToken);
  const [row] = await db
    .select({ tokenKey: tokenBlocklistTable.tokenKey })
    .from(tokenBlocklistTable)
    .where(eq(tokenBlocklistTable.tokenKey, key));
  return !!row;
}

/** Extract userId/userRole from a Bearer JWT in the Authorization header, or from the session cookie. */
async function resolveIdentity(req: Request): Promise<{ userId: number; userRole: string } | null> {
  // 1. Try Bearer token (mobile / non-cookie clients)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice(7);
    try {
      const payload = jwt.verify(rawToken, JWT_SECRET) as JwtPayload;

      // Check blocklist using SHA-256 fingerprint — works for both legacy
      // tokens (no jti) and new tokens issued after this change.
      const revoked = await isTokenRevoked(rawToken);
      if (revoked) return null;

      // Re-check isActive and tokenVersion to handle admin-disabled/re-enabled accounts immediately
      const [user] = await db
        .select({
          isActive: usersTable.isActive,
          tokenVersion: usersTable.tokenVersion,
          role: usersTable.role,
        })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId));
      if (!user?.isActive) return null;

      // Reject stale tokens issued before the last admin re-enable.
      // Tokens without a tokenVersion field (issued before this feature was deployed)
      // are treated as version 1; the DB default is also 1, so they continue to work
      // until the account is re-enabled for the first time.
      const tokenVer = payload.tokenVersion ?? 1;
      if (tokenVer !== user.tokenVersion) return null;

      return { userId: payload.userId, userRole: user.role };
    } catch {
      return null;
    }
  }

  // 2. Fall back to session cookie (web)
  const userId = req.session?.userId;
  if (userId) {
    const [user] = await db
      .select({ isActive: usersTable.isActive, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user?.isActive) return null;
    return { userId, userRole: user.role };
  }

  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const identity = await resolveIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  req.userId = identity.userId;
  req.userRole = identity.userRole;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const identity = await resolveIdentity(req);
  if (!identity || identity.userRole !== "admin") {
    res.status(403).json({ error: "غير مسموح" });
    return;
  }
  req.userId = identity.userId;
  req.userRole = identity.userRole;
  next();
}

/**
 * Startup probe — verifies that the `token_blocklist` table exists and is
 * queryable.  Should be called once before the server starts accepting
 * requests.
 *
 * If the table has been accidentally dropped or renamed by a migration the
 * function throws, which lets the caller refuse to start instead of silently
 * accepting every previously-revoked JWT.
 *
 * @param dbOverride  Optional DB instance injected by tests so the failure
 *   path can be exercised without touching the real database.
 */
export async function assertBlocklistTableReachable(dbOverride?: typeof db): Promise<void> {
  // A bare SELECT 1 FROM the table is enough: it will throw a PostgreSQL
  // "relation does not exist" error (code 42P01) if the table is missing,
  // and succeeds instantly even on an empty table.
  const database = dbOverride ?? db;
  await database
    .select({ one: tokenBlocklistTable.id })
    .from(tokenBlocklistTable)
    .limit(1);
}

/**
 * Delete all expired blocklist entries.
 *
 * Called once at server startup AND every hour via setInterval (see index.ts).
 * Running at startup ensures rows accumulated during any downtime are removed
 * before they can slow down auth checks.
 *
 * The DELETE is backed by `idx_token_blocklist_expires_at` (btree on
 * expires_at), so the query is always a fast range seek — not a sequential
 * scan — even if thousands of stale rows built up during a long outage.
 *
 * Expected table size: O(N) where N = number of active user sessions whose
 * tokens were explicitly revoked (logout / admin disable). At steady state
 * with a 30-day JWT lifetime this is typically single-digit rows for small
 * deployments and at most a few thousand for large ones.
 */
/** Threshold above which a single purge cycle triggers a warning log. */
const PURGE_WARN_THRESHOLD = 100;

/**
 * Delete all expired blocklist entries and return the number of rows removed.
 *
 * Callers should log the count (info) and emit a warning when it exceeds
 * PURGE_WARN_THRESHOLD, which may signal an attack or application bug.
 */
export async function purgeExpiredBlocklistEntries(): Promise<number> {
  const result = await db
    .delete(tokenBlocklistTable)
    .where(lt(tokenBlocklistTable.expiresAt, new Date()));
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

export { PURGE_WARN_THRESHOLD };

// Augment express-session
declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: string;
  }
}
