# 6. الأمان والبيانات والامتثال | Security, Data, and Compliance

## العربية

### حماية الحساب

- جلسات خادمية آمنة مع `SESSION_SECRET`.
- كلمات المرور تُخزّن بصورة مجزأة لا كنص صريح.
- التحقق من البريد واستعادة الحساب بمسارات محددة المدة.
- إبطال الجلسات والرموز عند تغيير بيانات الأمان.
- حماية المسارات الإدارية بصلاحيات الخادم.

### عزل البيانات

- كل مستخدم يرى بياناته فقط.
- كل قضية وملف ومحادثة مرتبطة بمالكها.
- تطبيق العزل في API وقاعدة البيانات، لا عبر إخفاء الأزرار فقط.
- عدم تسجيل محتوى المستندات أو الأسرار في السجلات.
- روابط الملفات مؤقتة ومحدودة الصلاحية.
- الحذف الآمن والاستجابة لطلبات أصحاب البيانات ضمن السياسة المعتمدة.
- السرية التامة للوقائع والمرفقات والمخرجات: لا تستخدم للتدريب أو التسويق أو إتاحة خدمة لمستفيد آخر.
- يطبق مبدأ أقل قدر لازم من الوصول؛ لا تعرض المراجعة البشرية إلا حزمة الحالة والمرفقات التي اختارها المستفيد عند طلب تأكيد المحامية.
- تسجل عمليات فتح الحزمة أو تنزيل الملف أو تغيير حالة طلب التأكيد في سجل تدقيق دون حفظ محتوى المستند داخل السجل.

### المرفقات والمخرجات

- تقبل كل خدمة نشطة ملفات PDF وDOCX وTXT والصور المدعومة وفق الحجم والحدود الفنية المعلنة.
- يتحقق الخادم من الصيغة والحجم والمالك قبل استخراج النص أو معالجة الملف.
- يراجع المستفيد النص المستخرج، عند الحاجة، قبل استخدامه في التحليل.
- يكون تنزيل Word وPDF محدوداً بالمالك والصلاحية ورابط أو جلسة آمنة؛ ولا تتضمن النسخة المصدرة بيانات داخلية أو معلومات تواصل محظورة داخل المخرج القانوني.

### تأكيد المحامية

- جميع الخدمات تعمل تحت إشراف د. رباب أحمد المعبي.
- لا يُنشأ طلب تأكيد المحامية إلا بإجراء صريح من المستفيد يحدد نوع المراجعة ونطاقها.
- لا يعد طلب التأكيد رأياً قانونياً ملزماً أو ضماناً للنتيجة قبل اكتمال المراجعة المهنية وإشعار المستفيد بالنتيجة.

### الدفع والحصص

- التحقق من العملية على الخادم.
- التفعيل والخصم في عملية ذرية قدر الإمكان.
- الخصم بعد نجاح المخرج فقط.
- منع التكرار باستخدام معرف جلسة العميل وسجلات deduplication.
- لا يعتمد التطبيق على قيمة الحصة القادمة من الواجهة.

### الجوال

- تخزين أقل قدر ممكن من البيانات الحساسة.
- استخدام التخزين الآمن للجلسة عند الحاجة.
- عدم تضمين أسرار المزودين أو مفاتيح الإدارة.
- دعم تسجيل الخروج وإبطال الجلسة عن بعد.
- حماية لقطات الشاشة والروابط والمرفقات وفق سياسة المنتج.

### الامتثال المهني

- إخلاء مسؤولية ثابت.
- لا ضمان للنتيجة ولا توقع للحكم.
- مراجعة بشرية للمخرجات التي تحتاج اعتماداً.
- عدم استخدام بيانات العملاء لتدريب النماذج.
- الاحتفاظ بسجل تدقيق للإجراءات الحساسة.

## English

### Account security

- Secure server-side sessions with `SESSION_SECRET`.
- Passwords are hashed, never stored in plaintext.
- Time-bounded email verification and recovery flows.
- Session/token revocation after security changes.
- Server-side authorization for every admin route.

### Data isolation

- Users can access only their own data.
- Every case, file, and conversation is linked to its owner.
- Isolation is enforced in the API and database, not only by hiding UI.
- File contents and secrets never appear in logs.
- File links are temporary and permission-limited.
- Safe deletion and data-subject request handling follow the approved policy.
- Facts, attachments, and outputs are strictly confidential. They are never used for training, marketing, or another beneficiary's service.
- Least-privilege access applies. Human review can access only the case package and attachments explicitly selected by the beneficiary when requesting lawyer confirmation.
- Opening a package, downloading a file, or changing a confirmation-request status creates an audit event without writing document contents to logs.

### Billing and quotas

- Payments are verified on the server.
- Activation and deduction are as atomic as practical.
- Quota is deducted only after a successful output.
- Client-session identifiers and deduplication prevent repeated charges/actions.
- The app never trusts a quota value supplied by the client.

### Attachments, exports, and lawyer confirmation

Every active service accepts the supported PDF, DOCX, TXT, and image formats within documented limits. The server validates file type, size, and ownership before extraction or processing, and the beneficiary can review extracted text when needed. Word and PDF exports remain limited to the owner and entitlement and never include internal data or prohibited contact information inside the legal output. Every service is supervised by Dr. Rabab Ahmed Almoaibi. A confirmation request requires the beneficiary's explicit action and selected scope; it is not itself a binding legal opinion or an outcome guarantee.

### Mobile and professional compliance

Store the minimum sensitive data, use secure session storage, never bundle provider/admin keys, support logout and revocation, and preserve the same disclaimer, review, audit, and no-guarantee rules across platforms.
