import { Router, type IRouter } from "express";
import { db, subscriptionsTable, packagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateSubscriptionBody } from "@workspace/api-zod";

const router: IRouter = Router();

function formatSub(sub: typeof subscriptionsTable.$inferSelect, pkg?: typeof packagesTable.$inferSelect) {
  return {
    id: sub.id,
    userId: sub.userId,
    packageId: sub.packageId,
    package: pkg
      ? {
          id: pkg.id,
          nameAr: pkg.nameAr,
          nameEn: pkg.nameEn,
          descriptionAr: pkg.descriptionAr,
          price: parseFloat(pkg.price as string),
          questionsAllowed: pkg.questionsAllowed,
          type: pkg.type,
          billingPeriod: pkg.billingPeriod,
          isActive: pkg.isActive,
          isPopular: pkg.isPopular,
          features: pkg.features ?? [],
          sortOrder: pkg.sortOrder,
        }
      : undefined,
    status: sub.status,
    questionsUsed: sub.questionsUsed,
    questionsAllowed: sub.questionsAllowed,
    questionsRemaining: Math.max(0, sub.questionsAllowed - sub.questionsUsed),
    startDate: sub.startDate,
    endDate: sub.endDate,
  };
}

router.get("/subscriptions/my", requireAuth, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  // Order by id DESC so the most recently created active subscription is used
  // when a user somehow ends up with multiple active rows (e.g. after a payment).
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")))
    .orderBy(desc(subscriptionsTable.id));
  if (subs.length === 0) {
    res.json(null);
    return;
  }
  const sub = subs[0];
  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, sub.packageId));
  res.json(formatSub(sub, pkg));
});

router.post("/subscriptions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, parsed.data.packageId));
  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }

  // Cancel existing active subscriptions
  await db
    .update(subscriptionsTable)
    .set({ status: "cancelled" })
    .where(and(eq(subscriptionsTable.userId, req.userId!), eq(subscriptionsTable.status, "active")));

  const endDate = pkg.type === "monthly" || pkg.type === "business"
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;

  const [sub] = await db.insert(subscriptionsTable).values({
    userId: req.userId!,
    packageId: pkg.id,
    questionsAllowed: pkg.questionsAllowed,
    grandfatheredUnlimited: false,
    endDate,
  }).returning();

  res.status(201).json(formatSub(sub, pkg));
});

export default router;
