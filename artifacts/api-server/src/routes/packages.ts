import { Router, type IRouter } from "express";
import { db, packagesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import {
  CreateAdminPackageBody,
  UpdateAdminPackageBody,
  GetPackageParams,
  UpdateAdminPackageParams,
  DeleteAdminPackageParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatPackage(pkg: typeof packagesTable.$inferSelect) {
  return {
    id: pkg.id,
    nameAr: pkg.nameAr,
    nameEn: pkg.nameEn,
    descriptionAr: pkg.descriptionAr,
    price: parseFloat(pkg.price as string),
    questionsAllowed: pkg.questionsAllowed,
    type: pkg.type,
    isActive: pkg.isActive,
    isPopular: pkg.isPopular,
    features: pkg.features ?? [],
    sortOrder: pkg.sortOrder,
  };
}

router.get("/packages", async (_req, res): Promise<void> => {
  const pkgs = await db.select().from(packagesTable)
    .where(eq(packagesTable.isActive, true))
    .orderBy(asc(packagesTable.sortOrder));
  res.json(pkgs.map(formatPackage));
});

router.get("/packages/:id", async (req, res): Promise<void> => {
  const params = GetPackageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, params.data.id));
  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }
  res.json(formatPackage(pkg));
});

// Admin routes
router.get("/admin/packages", requireAdmin, async (_req, res): Promise<void> => {
  const pkgs = await db.select().from(packagesTable).orderBy(asc(packagesTable.sortOrder));
  res.json(pkgs.map(formatPackage));
});

router.post("/admin/packages", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [pkg] = await db.insert(packagesTable).values({
    ...parsed.data,
    price: String(parsed.data.price),
    features: parsed.data.features ?? [],
    isPopular: parsed.data.isPopular ?? false,
    sortOrder: parsed.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json(formatPackage(pkg));
});

router.patch("/admin/packages/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminPackageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAdminPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.price !== undefined) updates.price = String(parsed.data.price);

  const [pkg] = await db.update(packagesTable).set(updates).where(eq(packagesTable.id, params.data.id)).returning();
  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }
  res.json(formatPackage(pkg));
});

router.delete("/admin/packages/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminPackageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.update(packagesTable).set({ isActive: false }).where(eq(packagesTable.id, params.data.id));
  res.json({ success: true });
});

export default router;
