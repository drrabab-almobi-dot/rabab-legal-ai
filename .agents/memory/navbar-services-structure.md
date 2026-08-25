---
name: هيكل Navbar — 5 خدمات مستقلة
description: بعد إعادة الهيكلة، الـ navbar يحتوي على 10 عناصر بدلاً من 7 — الخدمات الخمس مستقلة
---

## الهيكل الحالي للـ navLinks (بعد أغسطس 2026)

```typescript
const navLinks = [
  { name: 'الرئيسية', path: '/' },
  { name: 'استشارة قانونية', path: '/consultation' },
  { name: 'استشارة قضائية', path: '/legal-assistant?service=judicial' },
  { name: 'المذكرات', path: '/legal-assistant?service=pleadings' },
  { name: 'العقود', path: '/contracts' },
  { name: 'الباحثة الذكية', path: '/legal-search' },
  { name: 'الباقات', path: '/pricing' },
  { name: 'مبادرات', path: '/initiatives' },
  { name: 'حجز موعد', path: '/appointment' },
  { name: 'تواصل', path: '/contact' },
];
```

**Why:** المستخدم طلب صراحةً إزالة عنصر "الخدمات" المجمّع واستبداله بـ 5 خدمات مستقلة.

**How to apply:** عند إضافة خدمة جديدة، تُضاف كعنصر منفصل وليس تحت "الخدمات".
عند تحرير الـ navbar، ابدأ من العنصر المحدد فقط ولا تعد كتابة الكل.
