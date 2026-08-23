# RABAB LEGAL AI — الخطة الرئيسية | Master Project Plan

**Updated / آخر تحديث:** 23 August 2026  
**Status / الحالة:** Development environment; web-first delivery with a planned mobile companion  
**Source of truth / المرجع:** `replit.md` and the approved product rules

## 1. Vision | الرؤية

### العربية

RABAB LEGAL AI هي منصة قانونية عربية تساعد الأفراد والأعمال والمحامين على فهم المسائل القانونية، البحث في المصادر، إعداد المسودات، وتحليل العقود والمستندات. المنصة لا تستبدل المحامي ولا تضمن نتيجة؛ كل مخرج مساعد يحتاج إلى مراجعة مهنية عند اللزوم.

### English

RABAB LEGAL AI is an Arabic legal platform that helps individuals, businesses, and legal professionals understand legal issues, search trusted sources, prepare drafts, and analyze contracts and documents. It does not replace a lawyer or guarantee an outcome; assisted outputs require professional review when appropriate.

## 2. Product scope | نطاق المنتج

### العربية

- الاستشارة القانونية العامة.
- الاستشارة القضائية وإدارة القضية.
- الباحث القانوني الذكي.
- صياغة العقود وتحليلها واستخراج بياناتها.
- حفظ الجلسات والنتائج والتصدير حسب الصلاحية.
- الحسابات والباقات والحصص والدفع والفواتير.
- لوحة إدارة المصادر والمستخدمين والجودة.
- تطبيق جوال للمستخدم النهائي مرتبط بنفس الحساب والـ API.

### English

- General legal consultation.
- Judicial consultation and case management.
- Smart legal research.
- Contract drafting, analysis, and data extraction.
- Saved sessions, results, and permission-based exports.
- Accounts, plans, quotas, payments, and invoices.
- Admin tools for sources, users, and quality.
- An end-user mobile app using the same account and API.

## 3. Platforms | المنصات

| Platform | Arabic plan | English plan |
|---|---|---|
| Web | المنصة الأساسية: الخدمات، الحساب، الدفع، البحث، العقود، الإدارة | Primary product: services, auth, billing, search, contracts, and admin |
| Mobile | تطبيق Expo/React Native للمستخدم النهائي: استشارات، بحث، ملفات، سجل، تنبيهات | Expo/React Native end-user app: consultations, research, files, history, and notifications |
| API | خادم موحد يطبق الصلاحيات والحصص ويحفظ البيانات | Shared server enforcing authorization, quotas, and persistence |
| Admin | الويب هو سطح الإدارة؛ لا تُبنى إدارة المكتب في الجوال | Web is the admin surface; law-office management is out of scope for mobile |

**Execution rule / قاعدة التنفيذ:** Web stability and API contracts come first. Mobile development starts after the web quality gate, but mobile requirements remain part of the product plan from day one.

## 4. Core user journeys | المسارات الأساسية

### العربية

1. زائر يتصفح الخدمات بدون تسجيل دخول.
2. يحدد الخدمة والدولة والاختصاص.
3. يسجل الدخول عند بدء خدمة محمية ويعود إلى المسار نفسه.
4. يرسل الوقائع أو المستند.
5. يحصل على تحليل واضح بمراجع قابلة للتحقق.
6. يحفظ النتيجة أو يصدرها حسب الباقة.
7. يعود لاحقاً من الويب أو الجوال إلى السجل نفسه.

### English

1. A visitor browses public service descriptions.
2. The user selects a service, country, and jurisdiction.
3. Protected actions require sign-in and preserve the return path.
4. The user submits facts or a document.
5. The platform returns a clear analysis with verifiable references.
6. The user saves or exports the result according to plan permissions.
7. The same history is available later on web or mobile.

## 5. Delivery roadmap | خارطة التنفيذ

| Phase | العربية | English | Gate |
|---|---|---|---|
| 0 | الحوكمة وتثبيت المواصفات والهوية | Governance, fixed requirements, and visual identity | One approved source of truth |
| 1 | قاعدة المعرفة والمصادر الرسمية | Knowledge base and official sources | Traceable approved documents |
| 2 | البحث والتحقق ومنع الهلوسة | Search, ranking, and verification | No unverified citation presented as fact |
| 3 | الاستشارات والعقود وإدارة القضية | Consultations, contracts, and cases | Correct service level and saved outputs |
| 4 | الحساب والباقات والحصص والدفع | Auth, plans, quotas, and billing | Atomic entitlement and quota behavior |
| 5 | الإدارة والتشغيل والجودة | Admin operations and quality controls | Auditable sensitive actions |
| 6 | المزامنة والمراجعة البشرية | Sync and human approval pipeline | Resumable, approved ingestion |
| 7 | بوابة الجودة والإطلاق | QA gate and release preparation | Explicit owner approval before production |
| 8 | تطبيق الجوال | Mobile end-user application | Web/mobile parity for core flows |

## 6. Technical direction | الاتجاه التقني

### العربية

- الويب: React + Vite + Tailwind + Framer Motion.
- الجوال: Expo/React Native.
- الخادم: Express 5 وTypeScript.
- البيانات: PostgreSQL وDrizzle ORM.
- المصادقة: جلسات خادمية مع حماية الصلاحيات على الخادم.
- الذكاء الاصطناعي: نماذج اقتصادية للفرز والتلخيص، ونماذج أقوى للتحليل المهم.
- البحث: استرجاع حرفي ودلالي وإعادة ترتيب والتحقق البرمجي.
- مشاركة الويب والجوال: API واحد، عقود واضحة، وعدم وضع مفاتيح مزودين داخل الجوال.

### English

- Web: React, Vite, Tailwind, and Framer Motion.
- Mobile: Expo/React Native.
- Server: Express 5 and TypeScript.
- Data: PostgreSQL and Drizzle ORM.
- Auth: server-side sessions with server-enforced authorization.
- AI: economical models for triage/summaries and stronger models for important analysis.
- Search: literal and semantic retrieval, reranking, and programmatic verification.
- Web/mobile sharing: one API, explicit contracts, and no provider keys in the app.

## 7. Trust and compliance | الثقة والامتثال

### العربية

- منع اختلاق المواد والأحكام والتعاميم.
- منع خلط الدول والاختصاصات.
- عدم عرض توقع حكم أو ضمان نتيجة.
- عدم استخدام بيانات العملاء لتدريب النماذج.
- عزل بيانات المستخدمين والقضايا.
- روابط ملفات آمنة ومؤقتة وسجل عمليات.
- إخلاء مسؤولية ثابت ومراجعة بشرية عند الحاجة.

### English

- No fabricated statutes, judgments, circulars, or precedents.
- No cross-jurisdiction source mixing.
- No judgment prediction or outcome guarantee.
- Customer documents are not used to train models.
- User and case data are isolated.
- Secure temporary file links and audit trails.
- A fixed disclaimer and human review when needed.

## 8. Definition of done | تعريف الإنجاز

### العربية

لا تُعد الميزة منجزة إلا إذا عملت على المسار الصحيح، وطبقت الصلاحيات من الخادم، وحافظت على الحصة والبيانات، وأظهرت حالات التحميل والخطأ، واجتازت الفحص المناسب، ولم تخالف الهوية أو وثيقة المواصفات.

### English

A feature is done only when it follows the correct journey, enforces authorization on the server, preserves quota and data integrity, exposes loading and error states, passes the relevant checks, and complies with the visual and product rules.
