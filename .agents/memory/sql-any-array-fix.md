---
name: Drizzle SQL ANY array casting bug
description: Drizzle sql template يحوّل الـ array إلى record/tuple لا array — يسبب "cannot cast type record to integer[]"
---

## المشكلة

```typescript
// ❌ خاطئ — يولّد: ($1, $2, ...)::int[]  → record type لا array
sql`WHERE id = ANY(${ids}::int[])`

// ✅ صحيح — لقيم integer فقط من DB (آمنة من SQL injection)
sql`WHERE id IN (${sql.raw(ids.join(','))})`

// ✅ بديل آمن للقيم من المستخدم — استخدم UNNEST
sql`WHERE id = ANY(SELECT unnest(${ids}::int[]))`
```

**Why:** Drizzle يُحوّل الـ array parameter إلى `($1, $2, ...)` وهو composite row type في PostgreSQL، لا `ARRAY[$1, $2, ...]`.

**How to apply:** عند استخدام `ANY(...)` مع مصفوفة integers من DB queries، استبدلها بـ `IN (${sql.raw(ids.join(','))})`.
للقيم من المستخدم، استخدم `inArray()` من drizzle-orm أو UNNEST مع parameterized values.
