import { Router, type IRouter } from "express";
import { db, notificationsTable, userNotificationsTable, usersTable } from "@workspace/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
const router: IRouter = Router();

// ── User: register Expo push token ───────────────────────────────────────────
router.post("/notifications/push-token", requireAuth, async (req, res): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) {
    res.status(400).json({ error: "token مطلوب" });
    return;
  }

  await db
    .update(usersTable)
    .set({ pushToken: token })
    .where(eq(usersTable.id, req.userId!));

  res.json({ success: true });
});

// ── User: unregister push token (on logout) ───────────────────────────────────
router.delete("/notifications/push-token", requireAuth, async (req, res): Promise<void> => {
  await db
    .update(usersTable)
    .set({ pushToken: null })
    .where(eq(usersTable.id, req.userId!));

  res.json({ success: true });
});

// ── Admin: create notification ────────────────────────────────────────────────
router.post("/admin/notifications", requireAdmin, async (req, res): Promise<void> => {
  const { titleAr, titleEn, bodyAr, bodyEn, type, publish } = req.body;
  if (!titleAr || !bodyAr) {
    res.status(400).json({ error: "العنوان والنص مطلوبان" });
    return;
  }

  const [notif] = await db.insert(notificationsTable).values({
    titleAr,
    titleEn: titleEn || null,
    bodyAr,
    bodyEn: bodyEn || null,
    type: type || "info",
    isPublished: publish === true,
    publishedAt: publish === true ? new Date() : null,
  }).returning();

  // If published immediately, fan-out to all users
  if (publish === true) {
    const users = await db.select({ id: usersTable.id }).from(usersTable);
    if (users.length > 0) {
      await db.insert(userNotificationsTable).values(
        users.map(u => ({ userId: u.id, notificationId: notif.id }))
      );
    }
  }

  res.status(201).json(notif);
});

// ── Admin: list notifications ─────────────────────────────────────────────────
router.get("/admin/notifications", requireAdmin, async (_req, res): Promise<void> => {
  const notifs = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt));
  res.json(notifs);
});

// ── Admin: publish a notification ─────────────────────────────────────────────
router.post("/admin/notifications/:id/publish", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [notif] = await db.update(notificationsTable)
    .set({ isPublished: true, publishedAt: new Date() })
    .where(eq(notificationsTable.id, id))
    .returning();
  if (!notif) { res.status(404).json({ error: "لم يُوجد" }); return; }

  // Fan-out to all users
  const users = await db.select({ id: usersTable.id }).from(usersTable);
  if (users.length > 0) {
    // Insert only for users who don't already have this notification
    const existing = await db.select({ userId: userNotificationsTable.userId })
      .from(userNotificationsTable)
      .where(eq(userNotificationsTable.notificationId, id));
    const existingIds = new Set(existing.map(e => e.userId));
    const newUsers = users.filter(u => !existingIds.has(u.id));
    if (newUsers.length > 0) {
      await db.insert(userNotificationsTable).values(
        newUsers.map(u => ({ userId: u.id, notificationId: id }))
      );
    }
  }

  res.json(notif);
});

// ── Admin: delete notification ────────────────────────────────────────────────
router.delete("/admin/notifications/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  res.json({ success: true });
});

// ── User: get my notifications ────────────────────────────────────────────────
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: userNotificationsTable.id,
      notificationId: notificationsTable.id,
      titleAr: notificationsTable.titleAr,
      titleEn: notificationsTable.titleEn,
      bodyAr: notificationsTable.bodyAr,
      bodyEn: notificationsTable.bodyEn,
      type: notificationsTable.type,
      publishedAt: notificationsTable.publishedAt,
      readAt: userNotificationsTable.readAt,
    })
    .from(userNotificationsTable)
    .innerJoin(notificationsTable, eq(userNotificationsTable.notificationId, notificationsTable.id))
    .where(and(
      eq(userNotificationsTable.userId, req.userId!),
      eq(notificationsTable.isPublished, true),
    ))
    .orderBy(desc(notificationsTable.publishedAt));

  const unreadCount = rows.filter(r => !r.readAt).length;
  res.json({ notifications: rows, unreadCount });
});

// ── User: mark notification as read ──────────────────────────────────────────
router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.update(userNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(userNotificationsTable.id, id),
      eq(userNotificationsTable.userId, req.userId!),
    ));
  res.json({ success: true });
});

// ── User: mark all as read ────────────────────────────────────────────────────
router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  await db.update(userNotificationsTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(userNotificationsTable.userId, req.userId!),
      isNull(userNotificationsTable.readAt),
    ));
  res.json({ success: true });
});

export default router;
