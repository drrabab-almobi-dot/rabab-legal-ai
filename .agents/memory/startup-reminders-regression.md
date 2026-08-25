---
name: Startup Reminders Regression
description: Task merges keep reverting the fix that prevents reminder emails from firing on every server restart.
---

# مشكلة تكرار إرسال التذكيرات عند الإقلاع

## القاعدة
`startConsultationReminderScheduler()` و`startSubscriptionReminderScheduler()` **يجب أن لا تستدعيا** دالة الإرسال فوراً عند الإقلاع.
الدالتان موجودتان في:
- `artifacts/api-server/src/lib/consultation-reminder.ts`
- `artifacts/api-server/src/lib/subscription-reminder.ts`

## المشكلة
كل مرة تُدمج مهمة task agent تُعدّل هذين الملفين، يعود الكود إلى النمط القديم:
```typescript
export function startConsultationReminderScheduler(): void {
  sendPendingConsultationReminders().catch(...);  // ← هذا السطر يجب حذفه دائماً
  setInterval(...);
}
```

## الإصلاح الصحيح
```typescript
export function startConsultationReminderScheduler(): void {
  // ⚠️ لا نُشغّل فوراً — الدورة الأولى بعد 24 ساعة فقط
  const timer = setInterval(async () => {
    await sendPendingConsultationReminders();
  }, INTERVAL_MS);
  timer.unref();
}
```

**Why:** كل إعادة تشغيل + استدعاء فوري = إرسال 28+ رسالة تذكير → استنزاف رصيد Resend في يوم واحد.

**How to apply:** بعد كل دمج مهمة تُعدّل هذين الملفين، تحقق من عدم وجود الاستدعاء الفوري.
