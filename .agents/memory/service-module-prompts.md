---
name: Service Module Prompts System
description: نظام ملحقات تعليمات الخدمات في prompts/modules/ — يُحمَّل ملف بحسب taskType ويُضاف كـ system message
---

## الهيكل

```
artifacts/api-server/prompts/
  legal_system_prompt.md     ← الميثاق الأساسي (موجود)
  modules/
    01_consultation_legal.md
    02_consultation_judicial.md
    03_case_management.md
    04_pleadings.md
    05_judgment_analysis.md
    06_contracts.md
    07_research.md
```

## الخريطة (taskType → ملف)

| taskType | الملف |
|----------|-------|
| consultation | 01_consultation_legal.md |
| judicial | 02_consultation_judicial.md |
| case_management | 03_case_management.md |
| pleadings | 04_pleadings.md |
| judgment_analysis | 05_judgment_analysis.md |
| contract_draft / contract_review | 06_contracts.md |
| research | 07_research.md |

## المنطق

- `loadServiceModule(taskType)` في `legal-charter.ts`
- يتحقق من وجود الملف بـ `existsSync`
- يتجاهل الملفات الـ placeholder التي تبدأ بـ `# ملحق خدمة — قيد التحرير`
- يُخزَّن في cache في الذاكرة (لا يُعاد قراؤه في كل طلب)
- Graceful fallback: إذا الملف فارغ أو placeholder → null → لا يُضاف شيء

**Why:** لعزل تعليمات كل خدمة وتسهيل التحرير بدون تعديل الكود.

**How to apply:** لتفعيل ملحق خدمة، احذف سطر placeholder من الملف وأضف المحتوى الحقيقي.
ملاحظة: الـ cache يحتاج إعادة تشغيل الخادم لاستيعاب التغييرات.

## توافق مسارات الإنتاج

يجب أن يتحمل محمّل التعليمات اختلاف موقعه بين ملفات TypeScript المصدرية وملفات API المجمّعة داخل `dist`؛ لا تفترض أن مستوى `__dirname` ثابت بعد البناء.

**Why:** قد يعمل تحميل الميثاق في التطوير ثم يفشل أول طلب استشارة في الإنتاج إذا تغيّر مسار المجلد بعد التجميع.

**How to apply:** ابحث عن مجلد التعليمات عبر مسارات تطوير وإنتاج صريحة، واختبر التحميل من نسخة مجمعة قبل النشر.
