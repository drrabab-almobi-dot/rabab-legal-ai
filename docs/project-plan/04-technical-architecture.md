# 4. المعمارية التقنية | Technical Architecture

## العربية

### المكونات

| المكون | المسؤولية |
|---|---|
| `artifacts/rabab-legal` | تطبيق الويب RTL وصفحات الخدمات والحساب والإدارة |
| `artifacts/rabab-mobile` | تطبيق Expo/React Native للمستخدم النهائي |
| `artifacts/api-server` | المصادقة، الخدمات، الذكاء الاصطناعي، الملفات، الدفع، والإدارة |
| `lib/db` | مخطط PostgreSQL وDrizzle والكيانات المشتركة |
| `lib/api-spec` | عقد OpenAPI ومخططات التحقق |
| `docs/project-plan` | الخطة المرجعية القابلة للمراجعة |
| `artifacts/api-server/src/lib/service-registry.ts` | سجل وحدات الخدمات وحالاتها وقدراتها المشتركة |

### قواعد الاتصال

- الويب والجوال يتصلان بالـ API ولا يتصلان بقاعدة البيانات مباشرة.
- الصلاحيات والحصص والتحقق من الدفع تُفرض على الخادم.
- لا تُحفظ مفاتيح OpenAI أو الدفع أو Telegram داخل التطبيق.
- كل طلب حساس يحمل هوية المستخدم والجلسة المناسبة.
- يجب أن تعيد أخطاء API رسالة مفهومة دون تسريب محتوى الملفات أو الأسرار.
- تقرأ الواجهتان حالة الخدمة وقدراتها من سجل خادمي؛ الخدمة المخططة لا تُوجّه للمستفيد ولا تُحصّل لها حصة قبل تفعيلها واعتمادها.
- جميع الخدمات النشطة تدعم مرفقات المستفيد ومخرج Word وطلب تأكيد المحامية ضمن ضوابط وحدة الخدمة وصلاحية الباقة.

### البيانات الأساسية

المستخدمون، الجلسات، الاشتراكات، المدفوعات، الفواتير، الكوبونات، الاستشارات، رسائلها، القضايا، العقود، وثائق المعرفة، المقاطع، embeddings، الإشعارات، وسجل التدقيق. تضاف لاحقاً كيانات موحدة لتشغيل الخدمات، ومرفقاتها، ونتائجها، وطلبات تأكيد المحامية عند إكمال مسارها، بدلاً من إنشاء جداول متباعدة لكل خدمة جديدة.

### وحدات الخدمات القابلة للتوسع

تسجل كل خدمة في سجل مركزي بحالة `planned` أو `active` أو `retired`. يحتوي السجل على اسم الخدمة ووصفها، والقدرات المشتركة مثل استقبال مرفقات المستفيد وتصدير Word وطلب تأكيد المحامية، وقواعد توجيه الموضوعات إن كانت الخدمة ناضجة للتوجيه. لا يعني إدراج خدمة في السجل أنها صالحة للاستخدام؛ إذ تتطلب الخدمة الجديدة معالج API، ومخطط إدخال ومخرج، وصلاحية وحصة، وسياسة معرفة وتحقق، وقالب Word، ومسار مراجعة بشرية، واختبارات قبول قبل تفعيلها. سجلت خدمة توزيع الميراث كمخططة وغير متاحة، لذلك لا تدخل التوجيه أو التحصيل أو تجربة المستفيد.

### عقود API الجديدة

يوفر `GET /api/service-modules` قائمة عامة آمنة بالخدمات النشطة وقدراتها فقط، ليستخدمها الويب والجوال من مصدر واحد. لا يعرض هذا العقد أي خدمة مخططة، ومنها توزيع الميراث، حتى يصدر توجيه صريح بإظهارها بعد اكتمال اعتمادها. عند تنفيذ المرحلة التالية، تضاف عقود مستقلة لرفع المستندات الموحد، ونتائج الخدمة، وتصدير Word، وطلبات تأكيد المحامية. تفرض جميعها الملكية والصلاحية على الخادم، ولا تعيد أسماء الملفات الداخلية أو مفاتيح التخزين أو محتوى مستخدم آخر.

### التشغيل المحلي

```text
pnpm --filter @workspace/rabab-legal run dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/rabab-mobile run dev
pnpm run typecheck
```

### مسار الجوال

يبنى الجوال فوق عقود API ثابتة. يبدأ بالمصادقة، الخدمات، الاستشارات، البحث، السجل، رفع الملفات والتنبيهات. لوحة الإدارة تبقى على الويب، ولا يُكرر منطق الأعمال داخل التطبيق.

## English

### Components

- `artifacts/rabab-legal`: RTL web app for services, auth, billing, and admin.
- `artifacts/rabab-mobile`: Expo/React Native end-user application.
- `artifacts/api-server`: auth, services, AI, files, billing, and admin APIs.
- `lib/db`: shared PostgreSQL/Drizzle schema.
- `lib/api-spec`: OpenAPI source of truth and validation schemas.
- `docs/project-plan`: reviewable project documentation.
- `artifacts/api-server/src/lib/service-registry.ts`: central lifecycle and capability registry for service modules.

### Connectivity rules

- Web and mobile call the API; neither accesses the database directly.
- Authorization, quotas, and payment verification are server-enforced.
- Provider keys never ship in the mobile bundle.
- Sensitive requests carry the correct user identity and session.
- API errors must be useful without leaking file contents or secrets.
- Web and mobile read service state and capabilities from the server registry. A planned module cannot be routed, billed, or entered by a beneficiary before approved activation.
- Every active service supports beneficiary attachments, Word output, and a lawyer-confirmation request subject to the module policy and plan entitlement.

### Core data

Users, sessions, subscriptions, payments, invoices, coupons, consultations, messages, cases, contracts, knowledge documents, chunks, embeddings, notifications, and audit events. Unified service-run, document, result, and review-request entities are added as their dedicated workflow is completed, preventing each new service from creating isolated data models.

### Mobile architecture

Mobile consumes stable API contracts and reuses the same domain rules. It starts with auth, services, consultations, legal search, history, uploads, and notifications. Admin remains web-only, and business logic is not duplicated in the app.
