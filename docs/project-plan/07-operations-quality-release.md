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

### مراقبة التشغيل

- صحة الخادم وقاعدة البيانات.
- أخطاء المصادقة والدفع والملفات.
- زمن البحث والمعالجة.
- استهلاك النماذج والحصص.
- فشل المهام المجدولة وتكرار الإشعارات.
- جودة النص وعدد الوثائق والمقاطع المعتمدة.

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

Cover public pages and returns; auth and recovery; sessions, quotas, and daily limits; billing and recovery; search and citation verification; PDF/DOCX/TXT/scanned uploads; contracts; saved results and exports; admin permissions and audit logs; and mobile Android/iOS, RTL, network loss, notifications, and payment return.

### Monitoring

Monitor server/database health, auth/billing/file errors, search latency, model and quota usage, scheduled jobs and notification deduplication, and knowledge-base quality.

### Incident handling

Identify and contain the issue, disable the failing function without taking down login, preserve non-sensitive evidence, restart safely from checkpoints, test the fix, and record durable lessons.

### Release decision

There is no automatic production release. The owner approves release after web quality, security, and content review; mobile repeats the gate on supported devices.
