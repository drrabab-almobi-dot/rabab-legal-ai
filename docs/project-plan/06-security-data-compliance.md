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

### Billing and quotas

- Payments are verified on the server.
- Activation and deduction are as atomic as practical.
- Quota is deducted only after a successful output.
- Client-session identifiers and deduplication prevent repeated charges/actions.
- The app never trusts a quota value supplied by the client.

### Mobile and professional compliance

Store the minimum sensitive data, use secure session storage, never bundle provider/admin keys, support logout and revocation, and preserve the same disclaimer, review, audit, and no-guarantee rules across platforms.
