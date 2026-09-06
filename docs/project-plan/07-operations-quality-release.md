# 7. التشغيل والاختبار والإطلاق | Operations, Quality, and Release

## العربية

### بيئات التشغيل

- التطوير: workflows منفصلة للويب وAPI والجوال وmockup.
- الفحص: typecheck وlint وbuild واختبارات API واختبارات واجهة.
- الإنتاج: لا يُفعل إلا بعد موافقة صريحة، ولا تُبنى روابط إنتاج من الذاكرة.

### بوابة الاختبار

1. الواجهة العامة والخدمات وصفحات الرجوع.
2. التسجيل والدخول والتحقق واستعادة كلمة المرور.
3. الجلسات والحصص والحد اليومي.
4. الدفع والتفعيل والاسترداد والفواتير.
5. البحث وتحديد الدولة والتحقق من الاقتباسات.
6. رفع PDF وDOCX وTXT والملفات المصورة.
7. العقود: الصياغة والتحليل والاستخراج وآلية النزاع.
8. حفظ النتائج وإعادة فتحها والتصدير.
9. الصلاحيات الإدارية وسجل التدقيق.
10. الجوال: Android وiOS، RTL، انقطاع الشبكة، الإشعارات، والعودة من الدفع.
11. قبول الملفات في كل خدمة نشطة، وفحص النوع والحجم واستخراج النص وخصوصية السجل.
12. تصدير Word لكل مخرج قابل للحفظ، مع صحة RTL والمراجع والإخلاء وعدم تسريب بيانات داخلية.
13. طلب تأكيد المحامية: موافقة صريحة من المستفيد، حزمة مراجعة محدودة، وعزل وسجل وصول.
14. سجل وحدات الخدمات: لا تُوجّه أو تحصّل خدمة بحالة `planned` مثل توزيع الميراث، ولا تتأثر الخدمات النشطة بإضافة وحدة جديدة.

### مراقبة التشغيل

- صحة الخادم وقاعدة البيانات.
- أخطاء المصادقة والدفع والملفات.
- زمن البحث والمعالجة.
- استهلاك النماذج والحصص.
- فشل المهام المجدولة وتكرار الإشعارات.
- جودة النص وعدد الوثائق والمقاطع المعتمدة.
- محاولات الوصول غير المصرح بها إلى المرفقات وطلبات تأكيد المحامية.
- معدلات فشل التصدير إلى Word وحالة وحدات الخدمات المخططة والنشطة.

### خطة الحوادث

- تحديد الحالة والحد من الأثر.
- إيقاف الوظيفة المسببة دون إسقاط تسجيل الدخول.
- حفظ السجلات اللازمة دون محتوى حساس.
- إعادة تشغيل آمن واستئناف من checkpoint.
- اختبار الإصلاح قبل إعادة التفعيل.
- توثيق الدرس الدائم في الذاكرة أو الخطة، لا في سجل مؤقت فقط.

### قرار الإطلاق

لا نشر إنتاجي تلقائي. بعد اكتمال بوابة الويب، تُراجع الجودة والأمان والمحتوى، ثم تعتمد صاحبة المنصة الإطلاق. يكرر الجوال البوابة على الأجهزة المدعومة.

## English

### Environments

- Development: separate web, API, mobile, and mockup workflows.
- Validation: typecheck, lint, build, API tests, and UI tests.
- Production: enabled only after explicit approval; production URLs are obtained from deployment configuration.

### Test gate

Cover public pages and returns; auth and recovery; sessions, quotas, and daily limits; billing and recovery; search and citation verification; PDF/DOCX/TXT/scanned uploads in every active service; contracts; saved results and RTL Word/PDF exports; beneficiary-initiated lawyer-confirmation requests with scoped review access; admin permissions and audit logs; inactive/planned service-module guardrails; and mobile Android/iOS, RTL, network loss, notifications, and payment return.

### Monitoring

Monitor server/database health, auth/billing/file errors, search latency, model and quota usage, scheduled jobs and notification deduplication, knowledge-base quality, unauthorized attachment/review-access attempts, Word export failures, and planned-versus-active service-module states.

### Incident handling

Identify and contain the issue, disable the failing function without taking down login, preserve non-sensitive evidence, restart safely from checkpoints, test the fix, and record durable lessons.

### Release decision

There is no automatic production release. The owner approves release after web quality, security, and content review; mobile repeats the gate on supported devices.
