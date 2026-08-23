import { Router, type IRouter } from "express";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { desc, eq, like, or, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();

// ── Helper: log an action (called internally) ────────────────────────────────
export async function logAction(opts: {
  userId?: number | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}) {
  try {
    await db.insert(auditLogTable).values({
      userId: opts.userId ?? null,
      action: opts.action,
      targetType: opts.targetType,
      targetId: opts.targetId !== undefined ? String(opts.targetId) : undefined,
      details: opts.details,
      ip: opts.ip,
      userAgent: opts.userAgent,
    });
  } catch {
    // Never let audit logging break the main flow
  }
}

// ── Admin: list audit logs ────────────────────────────────────────────────────
router.get("/admin/audit-log", requireAdmin, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const search = (req.query.search as string) ?? "";

  const whereClause = search
    ? or(
        like(auditLogTable.action, `%${search}%`),
        like(auditLogTable.targetType, `%${search}%`),
        like(auditLogTable.ip, `%${search}%`),
      )
    : undefined;

  const [logs, countResult] = await Promise.all([
    db
      .select({
        id: auditLogTable.id,
        userId: auditLogTable.userId,
        userName: usersTable.name,
        userEmail: usersTable.email,
        action: auditLogTable.action,
        targetType: auditLogTable.targetType,
        targetId: auditLogTable.targetId,
        details: auditLogTable.details,
        ip: auditLogTable.ip,
        createdAt: auditLogTable.createdAt,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.userId, usersTable.id))
      .where(whereClause)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogTable).where(whereClause),
  ]);

  res.json({ logs, total: countResult[0]?.count ?? 0, page, limit });
});

export default router;
