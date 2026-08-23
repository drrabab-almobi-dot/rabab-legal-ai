import { Router, type IRouter } from "express";
import { db, couponsTable, packagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ValidateCouponBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/coupons/validate", async (req, res): Promise<void> => {
  const parsed = ValidateCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { code, packageId } = parsed.data;

  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code.toUpperCase()));
  if (!coupon || !coupon.isActive) {
    res.status(400).json({ error: "كوبون الخصم غير صالح أو منتهي الصلاحية" });
    return;
  }
  if (coupon.maxUses && coupon.usageCount >= coupon.maxUses) {
    res.status(400).json({ error: "تم استخدام كوبون الخصم بالحد الأقصى" });
    return;
  }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    res.status(400).json({ error: "انتهت صلاحية كوبون الخصم" });
    return;
  }

  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, packageId));
  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }

  const basePrice = parseFloat(pkg.price as string);
  const val = parseFloat(coupon.discountValue as string);
  const discountAmount = coupon.discountType === "percentage"
    ? (basePrice * val) / 100
    : Math.min(val, basePrice);
  const finalPrice = basePrice - discountAmount;

  res.json({
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: val,
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    finalPrice: parseFloat(finalPrice.toFixed(2)),
  });
});

export default router;
