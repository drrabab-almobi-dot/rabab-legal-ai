# دليل نشر تحديث RABAB LEGAL AI

## 1. ما تم تسليمه

هذه النسخة تعالج بوابة الاختبار المغلقة، ومسار فحص جلسة الزائر، وإعدادات SEO والفهرسة، وحالات 404، وتحويل نطاق `www`، وعدداً من مشكلات الوصول والتباين، وتحدّث الحزم الأمنية المباشرة. إعدادها الافتراضي **آمن للاختبار الخاص** ولا يفتح التسجيل أو الدفع للعامة تلقائياً.

## 2. المتطلبات

استخدم **Node.js 24.x** و`pnpm 10.34.5` كما هو محدد في المشروع. يجب أن يكون لديك مشروعا Vercel منفصلان: مشروع الواجهة من جذر المستودع، ومشروع API من `artifacts/api-server`. يجب إعداد قاعدة PostgreSQL ومتغيرات الخادم المطلوبة دون وضع أي أسرار داخل المستودع.

## 3. التحقق قبل النشر

نفّذ من جذر المشروع:

```bash
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile --prod=false
pnpm run typecheck
pnpm run lint
pnpm run check:vercel-config
pnpm run build:private
pnpm --filter @workspace/api-server run test:owner-access
pnpm --filter @workspace/api-server run test:owner-access-integration
```

من الطبيعي حالياً ظهور تحذيرات React Hooks قديمة في ملفات لم تُعدّل، لكن يجب ألا تظهر أخطاء Lint أو TypeScript أو Build.

## 4. نشر وضع الاختبار الخاص

اضبط في مشروع API:

```text
NODE_ENV=production
OWNER_TEST_MODE=admin_only
FRONTEND_URL=https://rabablegal.com
SITE_URL=https://rabablegal.com
APP_URL=https://rabablegal.com
CORS_ALLOWED_ORIGINS=https://rabablegal.com
```

أضف كذلك `DATABASE_URL` و`SESSION_SECRET` وبقية مفاتيح البريد والدفع والذكاء الاصطناعي المطلوبة فعلياً. لا تنسخ قيماً حقيقية إلى `.env.example`.

اضبط في **Build Environment** لمشروع الواجهة:

```text
PUBLIC_INDEXING=false
```

ينتج هذا الوضع صفحات عامة للمعلومات والأسعار والتواصل، بينما يبقى التسجيل والدفع والاستشارات والبيانات الخاصة للمسؤول فقط، وتظل الفهرسة معطلة.

## 5. التحويل إلى الإطلاق العام

لا تنفذ هذه الخطوة قبل اعتماد المحتوى القانوني، وتجربة إنشاء الحساب، والتحقق، والدفع، وسياسة الاسترداد، ومراقبة الأخطاء. بعد الاعتماد:

1. اضبط `OWNER_TEST_MODE=off` في مشروع API.
2. اضبط `PUBLIC_INDEXING=true` في Build Environment لمشروع الواجهة.
3. أعد نشر API أولاً، ثم الواجهة.
4. تحقق من `/api/healthz` و`/api/access-mode` و`/robots.txt` و`/sitemap.xml`.
5. اختبر حساباً جديداً ودفعاً تجريبياً في بيئة الدفع المعتمدة قبل قبول زيارات عامة.

يمكن محلياً التحقق من عقد SEO العام دون نشره باستخدام:

```bash
pnpm run build:public
```

## 6. النطاقات وDNS

تحتوي `vercel.json` على تحويل دائم من `www.rabablegal.com` إلى `https://rabablegal.com`. لكي يعمل التحويل، يجب إضافة النطاق `www.rabablegal.com` إلى مشروع Vercel نفسه وتوجيه DNS إليه حتى تُصدر شهادة TLS؛ لا يمكن لكود التطبيق معالجة طلب HTTPS قبل وصوله إلى Vercel.

## 7. التحقق بعد النشر

```bash
curl -I https://rabablegal.com/
curl -I https://www.rabablegal.com/
curl -i https://rabablegal.com/api/healthz
curl -i https://rabablegal.com/api/access-mode
curl -i https://rabablegal.com/api/auth/session
curl -i https://rabablegal.com/definitely-missing-route
curl -sS https://rabablegal.com/robots.txt
curl -sS https://rabablegal.com/sitemap.xml
```

المتوقع في وضع الاختبار الخاص: `access-mode` يعيد `admin_only`، وجلسة الزائر تعيد HTTP 200 مع `{"user":null}`، والمسار المفقود يعيد HTTP 404، و`robots.txt` يحتوي `Disallow: /`.

المتوقع في الإطلاق العام: `access-mode` يعيد `off`، و`robots.txt` يسمح بالصفحات العامة ويمنع مسارات الحساب والإدارة والدفع.

## 8. التراجع

إذا فشل التحقق بعد النشر، أعد `OWNER_TEST_MODE=admin_only` و`PUBLIC_INDEXING=false` فوراً ثم أعد نشر المشروعين. بعد ذلك ارجع إلى آخر Deployment سليم في Vercel، ولا تفتح التسجيل أو الدفع حتى تُحل المشكلة.

## 9. ملاحظة أمنية للتطبيق المحمول

يبقى تنبيهان عاليان في `image-size` ضمن سلسلة أدوات Expo/Metro ولا يوجد لهما إصدار مصحح منشور وفق سجل التدقيق وقت التحقق. لا تؤثر المكتبة في تشغيل الويب أو API، لكن ينبغي تحديث Expo عند صدور التصحيح، وعدم تمرير ملفات ICNS/JXL/HEIF غير موثوقة إلى أدوات بناء الجوال.
