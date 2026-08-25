---
name: Structured Summary Template
description: القالب الإلزامي للملخصات — تفاصيل التنفيذ والقواعد
---

## القاعدة
كل تعميم أو حكم أو مدونة يُعرض بجانب صورة الوثيقة الأصلية وفق هذا القالب الإلزامي.

## هيكل القالب للتعاميم/القرارات/الأوامر
١. **عنوان قصير** وصفي
٢. **فقرة افتتاحية**: "صدر [نوع] رقم [رقم] وتاريخ [تاريخ]هـ، بناءً على [السند]، لتقرير [الغرض]."
٣. **أبرز ما جاء في الوثيقة** — نقاط: عنوان بارز + شرح من النص
٤. **أهداف القرار** — فقط إذا وردت صراحةً في النص
٥. **جملة ختامية**: "الملخص أعلاه مُولَّد مساعداً للقراءة من نص الوثيقة الرسمية حصراً. المعتمد هو نص الوثيقة الأصلية."
٦. **زر**: "فتح الوثيقة الأصلية"

## هيكل القالب للقضايا (المدونات)
١. ملخص القضية (3-5 جمل من النص)
٢. التسبيب (حرفياً من النص)
٣. المنطوق / الحكم (حرفياً — موثّق بعلامة "مستخرج من النص")
٤. المبدأ المستخلص (فقط إذا وُجد نصاً صريحاً — بخلفية بنفسجية)
٥. جملة ختامية + زر فتح الوثيقة

## الضوابط الإلزامية
- من النص الرسمي حصراً — لا اختراع
- الأرقام والتواريخ حرفية — هجري + ميلادي بين قوسين
- لا عنصر بدون نص — null يحذفه تماماً
- لغة قانونية مهنية

## JSON Schema (CIRCULAR_TEMPLATE_SYSTEM_PROMPT)
الحقول: title, type, number, date_hijri, date_gregorian, issuer, basis, purpose, opening_para, highlights([{title, detail}]), objectives([]), status, addressees, relation_note

## مواقع التنفيذ
- **Frontend component**: `knowledge-search.tsx` → `StructuredSummaryBlock` (before CircularCard)
- **MOJ Circulars backend**: `moj-circulars.ts` → CIRCULAR_TEMPLATE_SYSTEM_PROMPT + detail endpoint يُولِّد ويُخزِّن في `structured_summary` JSONB column
- **Knowledge Circulars backend**: `knowledge.ts` → GPT prompt مُحدَّث بنفس الهيكل
- **Legal Codex processor**: `legal-codex-processor.ts` → EXTRACTION_SYSTEM_PROMPT مُحدَّث بقالب القضايا
- **Case detail UI**: `LegalCodexBrowser.tsx` → CaseDetailView بأقسام ظاهرة دائماً (لا accordion)
- **MOJ detail UI**: `knowledge-search.tsx` → تخطيط عمودين: ملخص (flex-1) + صورة (md:w-64)
- **CircularCard**: يستخدم StructuredSummaryBlock عند وجود highlights؛ fallback للبيانات القديمة

## DB
```sql
ALTER TABLE moj_circulars ADD COLUMN IF NOT EXISTS structured_summary JSONB DEFAULT NULL;
```
Schema: `lib/db/src/schema/moj-circulars.ts` → `structuredSummary: jsonb("structured_summary").$type<Record<string, any>>()`

**Why:** التنفيذ الأول للقالب — يُعاد استخدام نفس المكوّن في ثلاث شاشات لاتساق التجربة.
