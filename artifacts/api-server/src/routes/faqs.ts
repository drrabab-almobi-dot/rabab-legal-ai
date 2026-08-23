import { Router, type IRouter } from "express";
import { db, faqsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { CreateAdminFaqBody, UpdateAdminFaqBody, UpdateAdminFaqParams, DeleteAdminFaqParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/faqs", async (_req, res): Promise<void> => {
  const faqs = await db.select().from(faqsTable).orderBy(asc(faqsTable.sortOrder));
  res.json(faqs);
});

router.post("/admin/faqs", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAdminFaqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [faq] = await db.insert(faqsTable).values({
    ...parsed.data,
    sortOrder: parsed.data.sortOrder ?? 0,
  }).returning();
  res.status(201).json(faq);
});

router.patch("/admin/faqs/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminFaqParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAdminFaqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [faq] = await db.update(faqsTable).set(parsed.data).where(eq(faqsTable.id, params.data.id)).returning();
  if (!faq) {
    res.status(404).json({ error: "السؤال غير موجود" });
    return;
  }
  res.json(faq);
});

router.delete("/admin/faqs/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAdminFaqParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(faqsTable).where(eq(faqsTable.id, params.data.id));
  res.json({ success: true });
});

export default router;
