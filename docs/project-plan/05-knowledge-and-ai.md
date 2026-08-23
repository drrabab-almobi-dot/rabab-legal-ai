# 5. قاعدة المعرفة والذكاء الاصطناعي | Knowledge and AI

## العربية

### خط إدخال المعرفة

1. استقبال PDF أو TXT أو DOCX أو رابط مع تحديد الدولة ونوع المصدر.
2. استخراج النص مع دعم النص العربي وOCR عند الحاجة.
3. تنظيف النص وإزالة التشوهات دون تغيير المعنى.
4. تقسيم المستند إلى مقاطع مرتبطة بالوثيقة الأم والصفحة.
5. إنشاء embedding وفهرسة المقاطع.
6. استخراج البيانات الوصفية والتحقق من الرقم والتاريخ والجهة.
7. مراجعة بشرية واعتماد المصدر قبل دخوله إلى القاعدة المعتمدة.

### الاسترجاع

- بحث حرفي يفوز عند التطابق الصريح.
- بحث دلالي للمفاهيم والصياغات المختلفة.
- استعلامات متعددة عند الحاجة.
- إعادة ترتيب RRF وإزالة التكرار.
- تقييد النتائج بالدولة والاختصاص ونوع المصدر وحالة السريان.
- عدم تمرير الملف كاملاً إلى النموذج؛ تمرر المقاطع ذات الصلة فقط.

### التحقق والمخرجات

- التحقق من وجود النص والمرجع قبل عرض الاقتباس.
- إظهار حالة المصدر ودرجة الارتباط.
- التصريح بعدم العثور على مصدر موثق بدلاً من التخمين.
- فصل النص النظامي عن التحليل وعن الممارسة العملية.
- تطبيق قواعد الخدمة: الاستشارة العامة لا تعرض دفوعاً أو تقدير مركز قانوني.

### تكلفة الذكاء الاصطناعي

- نموذج اقتصادي للفرز والتلخيص والبيانات الوصفية.
- نموذج أقوى للتحليل القانوني المهم.
- embedding فقط للوثائق المعتمدة.
- عرض تقدير تكلفة دفعات المزامنة قبل تشغيل المعالجة.
- تسجيل الاستهلاك وربطه بالباقة.

### الجوال

الجوال يعرض حالة البحث أو التحليل والمصدر والنتيجة المحفوظة، ولا ينفذ مفاتيح النماذج أو خط أنابيب الفهرسة. عند انقطاع الشبكة يظهر آخر وضع معروف دون اعتبار النتيجة مكتملة قبل تأكيد الخادم.

## English

### Ingestion pipeline

1. Accept PDF, TXT, DOCX, or a URL with country and source type.
2. Extract text with Arabic support and OCR when needed.
3. Normalize extraction without changing legal meaning.
4. Chunk documents and preserve parent-document and page links.
5. Create embeddings and index chunks.
6. Extract metadata and verify number, date, and issuing authority.
7. Require human review and approval before trusted indexing.

### Retrieval

- Literal matches win when the wording is explicit.
- Semantic search handles paraphrases and concepts.
- Multi-query expansion is used when useful.
- RRF reranking and deduplication improve ordering.
- Country, jurisdiction, source type, and validity constrain results.
- Only relevant chunks are sent to a model, never the entire file by default.

### Verification and output

- Verify source text and identifiers before presenting a citation.
- Show source state and relevance.
- Say that no verified source was found instead of guessing.
- Separate statute text, analysis, and practical practice.
- Enforce service-level rules, including the limits of general consultation.

### Mobile boundary

Mobile displays search/analysis state, sources, and saved results. It never contains model keys or indexing logic. Network interruptions show the last known state and do not mark work complete before server confirmation.
