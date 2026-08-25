---
name: Daily Quota Limit (25%)
description: حد يومي = 25% من الرصيد الشهري — مطبَّق في checkAndReserveService في quota.ts
---

## القاعدة

لكل مستخدم مشترك بباقة مدفوعة غير محدودة:
- الحد اليومي = `ceil(monthly_allowed × 0.25)` (بحد أدنى 1)
- يُحسب من `usage_log.created_at >= today midnight`
- يُتجاوز للباقات المجانية (trial) والباقات غير المحدودة (consultations_allowed >= 9999)

## الموقع في الكود

```typescript
// في quota.ts → checkAndReserveService()
// بعد فحص الحصة الشهرية وقبل INSERT في service_sessions
const DAILY_QUOTA_FRACTION = 0.25;
```

**Why:** منع استنزاف الرصيد الشهري في يوم واحد.

**How to apply:** رسالة الخطأ تحتوي على الاستهلاك اليومي والحد — تُعرض للمستخدم كـ `message` في response.
الكود الخاص بالفحص اليومي: `eq(usageLogTable.userId, userId), gte(usageLogTable.createdAt, todayStart)`.
