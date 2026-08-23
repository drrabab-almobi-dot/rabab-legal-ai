# 8. القرارات والأعمال المفتوحة | Decisions and Backlog

## قرارات ثابتة | Fixed decisions

| العربية | English |
|---|---|
| الويب أولوية التنفيذ، والجوال جزء من الخطة ويُبنى بعد ثبات الويب والـ API. | Web is the delivery priority; mobile is planned and follows stable web/API contracts. |
| لا تعديل على `index.css` أو الألوان أو الخطوط دون طلب صريح. | Do not change `index.css`, colors, or fonts without explicit approval. |
| الخدمات لا تُضاف ولا تُحذف دون اعتماد. | Do not add or remove services without approval. |
| التحكيم خيار مختصر داخل آلية النزاع في صياغة العقود، وليس خدمة مضافة داخل النموذج. | Arbitration is a compact dispute-resolution option in drafting, not a new service inside the form. |
| القضاء هو الاختيار الافتراضي، وتفاصيل التحكيم تظهر بعد اختياره. | Judiciary is the default; arbitration details appear only after selection. |
| الزائر يتصفح، وتسجيل الدخول مطلوب عند بدء الخدمة المحمية. | Visitors browse freely; sign-in is required when a protected action begins. |
| الصلاحيات والحصص على الخادم. | Authorization and quotas are server-side. |
| لا نشر قبل الموافقة الصريحة. | No production release before explicit approval. |

## الأعمال ذات الأولوية | Priority work

### العربية

1. تثبيت جودة قاعدة المعرفة ومراجعة المصادر الرسمية.
2. حماية بيانات الاقتباسات أثناء إعادة الاستخراج الحي.
3. استكمال حفظ نتائج البحث وإعادة فتحها.
4. تحسين مؤشرات البحث الحي في الويب والجوال.
5. استكمال السحب القابل للاستئناف والمراجعة البشرية لـ MTProto عند اعتماد تشغيله.
6. تغطية اختبارات المصادقة والحصص والدفع والتذكيرات.
7. استكمال توحيد عقود API للجوال.
8. تنفيذ مسارات الجوال الأساسية بعد بوابة الويب.

### English

1. Stabilize knowledge-base quality and official-source review.
2. Protect citation metadata during live re-extraction.
3. Complete saved-search persistence and reopening.
4. Improve live-search indicators across web and mobile.
5. Complete resumable MTProto ingestion and human approval when activation is approved.
6. Expand auth, quota, billing, and reminder coverage.
7. Finalize shared mobile API contracts.
8. Implement core mobile flows after the web quality gate.

## قائمة منع التوسع | Scope guard

### العربية

قبل أي طلب جديد يُسأل:

- هل يخدم خدمة معتمدة؟
- هل يحتاج API أو قاعدة بيانات أو صلاحية جديدة؟
- هل يكرر وظيفة موجودة؟
- هل يغير الهوية البصرية أو النص التشغيلي؟
- هل يحتاج موافقة تكلفة أو نشر؟

إذا كانت الإجابة نعم على تغيير جوهري، يوثق القرار ومعيار القبول قبل التنفيذ.

### English

Before accepting new work, ask:

- Does it serve an approved service?
- Does it require a new API, data model, or permission?
- Does it duplicate an existing capability?
- Does it change the visual identity or operating charter?
- Does it require cost or release approval?

Material changes require a documented decision and acceptance criteria before implementation.

## مصدر التفاصيل التنفيذية | Execution source

The detailed task queue remains in `.local/tasks/`. This folder is the product-level plan; task files are the implementation queue and must not silently override the approved scope or security rules.
