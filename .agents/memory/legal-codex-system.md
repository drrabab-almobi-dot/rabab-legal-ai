---
name: Legal Codex System
description: نظام المدونات القضائية — البنية الكاملة، قرارات التصميم، والأخطاء التي تم إصلاحها
---

## القرارات الثابتة

- **PDF rendering**: client-side فقط عبر pdfjs-dist (مُثبَّت على rabab-legal) — لا server-side rendering
- **التخزين**: BYTEA في `legal_codices.file_data` (نفس نمط knowledge_documents)
- **أرقام الصفحات المزدوجة**: `page_start_file` (للعارض) + `page_start_printed` (للاستشهاد)
- **الاستخراج**: regex لاكتشاف حدود القضايا + GPT-4o-mini للبيانات الوصفية
- **درجة الثقة**: أي حقل confidence < 0.5 يُعرض "غير متوفر في المستند"

## أخطاء مهمة — يجب تذكّرها

### 1. pdf-parse يقرأ ملف تجريبي عند بدء التشغيل
- **المشكلة**: `pdf-parse` يفعل `readFileSync('./test/data/05-versions-space.pdf')` عند استيراده مباشرةً
- **الحل**: استخدم `import("pdf-parse/lib/pdf-parse.js")` (dynamic, lazy) بدلاً من static import
- **الكود الصحيح**:
```typescript
async function getPdfParse() {
  const mod = await import("pdf-parse/lib/pdf-parse.js" as any);
  return (mod.default ?? mod) as any;
}
```

### 2. مسارات الـ Router مقابل Express app mounting
- `app.use("/api", router)` → أي route في الـ router يُحذف منه `/api` prefix
- **User routes** في router: `router.get("/codex/search", ...)` → accessible at `/api/codex/search`
- **Admin routes** في router: `router.post("/admin/codex/upload", ...)` → accessible at `/api/admin/codex/upload`
- **لا تضع `/api` كبادئة** داخل مسارات الـ router — ستصبح `/api/api/...`

### 3. الـ Frontend URL pattern
- `API_BASE` = `import.meta.env.BASE_URL.replace(/\/$/, '')` = `/rabab-legal`
- User calls: `${API_BASE}/api/codex/search` → proxy → API receives `/api/codex/search` → router gets `/codex/search` ✓
- Admin calls: `${API_BASE}/api/admin/codex/list` → proxy → API receives `/api/admin/codex/list` → router gets `/admin/codex/list` ✓

## الملفات المُنشأة

- `lib/db/src/schema/legal-codex.ts` — Drizzle schema
- `lib/db/migrations/0011_legal_codex.sql` — migration مُطبَّق في DB
- `artifacts/api-server/src/lib/legal-codex-processor.ts` — منطق الاستخراج
- `artifacts/api-server/src/routes/legal-codex.ts` — جميع المسارات
- `artifacts/rabab-legal/src/components/DocumentPageViewer.tsx` — عارض PDF
- `artifacts/rabab-legal/src/components/LegalCodexBrowser.tsx` — واجهة البحث
- `artifacts/rabab-legal/src/pages/admin/legal-codex.tsx` — صفحة الإدارة

## حالة الـ DB

- جدولا `legal_codices` و `legal_cases` موجودان
- مدونة تجريبية (id=2) مع 3 قضايا للاختبار
- **هام**: الرفع الفعلي يتطلب PDF أصلي عبر صفحة الإدارة (`/admin/legal-codex`)

## تحقق إلزامي (لم يُنجز بعد)

المستخدمة طلبت فتح 3 قضايا فعلية والتحقق بصرياً من:
- وضوح صور الصفحات
- دقة الملخص والتسبيب والحكم
- تطابق أرقام الصفحات
**هذا شرط الإظهار للمستخدمين — يتطلب PDF أصلي مرفوع عبر الإدارة أولاً**

**Why:** تصميم النظام يفصل بين النص (للبحث) والصورة (للقراءة)، والتحقق البصري ضروري قبل فتح القسم للمستخدمين.
