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

### قواعد الاتصال

- الويب والجوال يتصلان بالـ API ولا يتصلان بقاعدة البيانات مباشرة.
- الصلاحيات والحصص والتحقق من الدفع تُفرض على الخادم.
- لا تُحفظ مفاتيح OpenAI أو الدفع أو أي بيانات اعتماد لمصدر خارجي داخل التطبيق.
- كل طلب حساس يحمل هوية المستخدم والجلسة المناسبة.
- يجب أن تعيد أخطاء API رسالة مفهومة دون تسريب محتوى الملفات أو الأسرار.

### البيانات الأساسية

المستخدمون، الجلسات، الاشتراكات، المدفوعات، الفواتير، الكوبونات، الاستشارات، رسائلها، القضايا، العقود، وثائق المعرفة، المقاطع، embeddings، الإشعارات، وسجل التدقيق.

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

### Connectivity rules

- Web and mobile call the API; neither accesses the database directly.
- Authorization, quotas, and payment verification are server-enforced.
- Provider keys never ship in the mobile bundle.
- Sensitive requests carry the correct user identity and session.
- API errors must be useful without leaking file contents or secrets.

### Core data

Users, sessions, subscriptions, payments, invoices, coupons, consultations, messages, cases, contracts, knowledge documents, chunks, embeddings, notifications, and audit events.

### Mobile architecture

Mobile consumes stable API contracts and reuses the same domain rules. It starts with auth, services, consultations, legal search, history, uploads, and notifications. Admin remains web-only, and business logic is not duplicated in the app.
