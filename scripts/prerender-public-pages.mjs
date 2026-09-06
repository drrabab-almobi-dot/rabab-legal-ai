import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.join(projectRoot, 'artifacts', 'rabab-legal');
const outputRoot = path.join(frontendRoot, 'dist', 'public');
const siteUrl = 'https://rabablegal.com';
const indexingEnabled = false;

const faqCategories = JSON.parse(
  await readFile(path.join(frontendRoot, 'src', 'content', 'faq.json'), 'utf8'),
);

const pages = [
  {
    pathname: '/',
    title: 'استشارة قانونية بالذكاء الاصطناعي | RABAB LEGAL AI',
    description:
      'RABAB LEGAL AI منصة قانونية رقمية تقدم معلومات قانونية أولية موثقة في الأنظمة السعودية والخليجية، مع خدمات الاستشارات وتحليل العقود والبحث القانوني.',
    content: `
      <section>
        <p>منصة قانونية رقمية متخصصة تجمع بين الذكاء الاصطناعي والإشراف القانوني المهني لمساعدة الأفراد والمنشآت على فهم المسائل القانونية في المملكة العربية السعودية ودول مجلس التعاون الخليجي.</p>
        <h2>الخدمات الرقمية</h2>
        <ul>
          <li><strong>الاستشارات القانونية:</strong> معلومات قانونية أولية منظمة وفق نوع المسألة والدولة.</li>
          <li><strong>الاستشارات القضائية:</strong> تنظيم الوقائع وتحليل المسار الإجرائي والحكم القضائي.</li>
          <li><strong>صياغة ومراجعة العقود:</strong> إعداد المسودات وتحليل البنود والمخاطر.</li>
          <li><strong>الباحثة الذكية:</strong> البحث في الأنظمة والمبادئ والتعاميم والمصادر القانونية.</li>
        </ul>
        <p>تُعرض الإجابات مع تمييز واضح بين المعلومات المعرفية والإجراء القانوني الرسمي، ولا تغني عن مراجعة محامٍ مرخّص عند الحاجة إلى تمثيل أو رأي ملزم.</p>
        <p><a href="/register">إنشاء حساب</a> · <a href="/login">تسجيل الدخول</a> · <a href="/pricing">استعراض الباقات</a></p>
      </section>`,
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'RABAB LEGAL AI',
        url: siteUrl,
        description:
          'منصة قانونية رقمية تقدم معلومات قانونية أولية موثقة في الأنظمة السعودية والخليجية.',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: 'RABAB LEGAL AI',
        url: siteUrl,
        inLanguage: 'ar-SA',
        publisher: { '@id': `${siteUrl}/#organization` },
      },
    ],
  },
  {
    pathname: '/about',
    title: 'من نحن | RABAB LEGAL AI',
    description:
      'تعرّف على RABAB LEGAL AI، المنصة القانونية الرقمية المتخصصة في الأنظمة السعودية والخليجية تحت إشراف مهني مباشر.',
    content: `
      <section>
        <p>RABAB LEGAL AI هي منصة قانونية رقمية متخصصة تقدم معلومات قانونية واضحة تساعد الأفراد والمنشآت على معرفة الحقوق والالتزامات وفق الأنظمة النافذة في المملكة العربية السعودية ودول مجلس التعاون الخليجي.</p>
        <h2>منهج الخدمة</h2>
        <p>تعتمد المنصة على التمييز بين النص النظامي واللائحة والقرار والحكم والمبدأ القضائي، ولا تقدّم معلومة قانونية غير موثقة كمعلومة مؤكدة.</p>
        <h2>الإشراف المهني</h2>
        <p>تُقدَّم الخدمة تحت إشراف مهني مباشر من المحامية والمحكم التجاري د. رباب أحمد المعبي، مع مراعاة أن المحتوى المعروض عبر المنصة لا يحل محل التمثيل القانوني الرسمي.</p>
      </section>`,
  },
  {
    pathname: '/pricing',
    title: 'الأسعار والباقات | RABAB LEGAL AI',
    description:
      'استعرض باقات RABAB LEGAL AI للاستشارات القانونية الرقمية وتحليل العقود والبحث القانوني قبل البدء بالخدمة.',
    content: `
      <section>
        <p>تقدم RABAB LEGAL AI باقات رقمية متفاوتة لتناسب الاستخدام الشخصي واستخدام المنشآت. تُراجع تفاصيل الباقة وسعرها وشروطها المعروضة في التطبيق قبل إتمام أي عملية دفع.</p>
        <h2>الباقات المعروضة</h2>
        <ul>
          <li><strong>تجربة مجانية:</strong> 3 تجارب مجانية.</li>
          <li><strong>باقة الاستشارات:</strong> 7 استشارات قانونية مقابل 149 ريالاً.</li>
          <li><strong>الاشتراك الشهري:</strong> 20 استشارة قانونية مقابل 349 ريالاً.</li>
          <li><strong>باقة الأعمال:</strong> 100 استشارة قانونية للمنشآت مقابل 699 ريالاً.</li>
        </ul>
        <p>يتم احتساب الاستخدام فقط بعد وصول إجابة ناجحة، ولا يُحتسب فتح الصفحة أو كتابة السؤال أو فشل الخدمة.</p>
      </section>`,
  },
  {
    pathname: '/contact',
    title: 'تواصل معنا | RABAB LEGAL AI',
    description:
      'تواصل مع فريق RABAB LEGAL AI للاستفسارات العامة والدعم المتعلق بالمنصة القانونية الرقمية.',
    content: `
      <section>
        <p>للاستفسارات العامة والدعم المتعلق بخدمات المنصة، يمكن التواصل مع فريق RABAB LEGAL AI عبر قنوات الاتصال المعروضة.</p>
        <h2>قنوات التواصل</h2>
        <ul>
          <li>البريد الإلكتروني: <a href="mailto:info@rabablegal.com">info@rabablegal.com</a></li>
          <li>الهاتف: <a href="tel:+966504647649">+966 50 464 7649</a></li>
          <li>منصة شركة المحاماة: <a href="https://rabablawyer.sa" rel="noopener noreferrer">rabablawyer.sa</a></li>
        </ul>
        <p>لا تُرسل وثائق حساسة أو كلمات مرور أو بيانات بنكية عبر نموذج التواصل العام.</p>
      </section>`,
  },
  {
    pathname: '/faq',
    title: 'الأسئلة الشائعة | RABAB LEGAL AI',
    description:
      'إجابات الأسئلة الشائعة حول RABAB LEGAL AI، ونطاق المعلومات القانونية الرقمية، والحسابات والباقات والخصوصية.',
    content: `<section><p>إجابات على الأسئلة المتكررة حول المنصة وخدماتها الرقمية.</p>${faqCategories
      .map(
        (category) => `<section><h2>${escapeHtml(category.title)}</h2>${category.faqs
          .map(
            (faq) => `<details><summary>${escapeHtml(faq.q)}</summary><p>${escapeHtml(faq.a)}</p></details>`,
          )
          .join('')}</section>`,
      )
      .join('')}</section>`,
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': `${siteUrl}/faq#faqpage`,
        mainEntity: faqCategories.flatMap((category) =>
          category.faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.q,
            acceptedAnswer: { '@type': 'Answer', text: faq.a },
          })),
        ),
      },
    ],
  },
  {
    pathname: '/privacy',
    title: 'سياسة الخصوصية | RABAB LEGAL AI',
    description:
      'سياسة خصوصية RABAB LEGAL AI المتعلقة بجمع بيانات الحساب والخدمة واستخدامها وحمايتها وحقوق المستخدم.',
    content: `
      <section>
        <p>توضح سياسة الخصوصية كيفية جمع بيانات الحساب والخدمة واستخدامها وحمايتها داخل RABAB LEGAL AI. يرجى مراجعة النسخة الكاملة في التطبيق قبل استخدام الخدمة.</p>
        <h2>ملخص السياسة</h2>
        <ul>
          <li>تُستخدم بيانات الحساب والخدمة لتقديم المنصة وحماية الحساب ومعالجة الاشتراكات.</li>
          <li>لا تُستخدم بيانات الاستشارات لتدريب نماذج الذكاء الاصطناعي وفق السياسة المعروضة.</li>
          <li>يمكن طلب الوصول إلى البيانات أو تصحيحها أو حذفها عبر قنوات التواصل الرسمية.</li>
        </ul>
        <p><a href="mailto:info@rabablegal.com">تواصل بخصوص الخصوصية</a></p>
      </section>`,
  },
  {
    pathname: '/terms',
    title: 'الشروط والأحكام | RABAB LEGAL AI',
    description:
      'شروط استخدام RABAB LEGAL AI ونطاق المعلومات القانونية الرقمية والحسابات والاشتراكات والوثائق.',
    content: `
      <section>
        <p>تبيّن الشروط والأحكام نطاق استخدام منصة RABAB LEGAL AI، وأهلية التسجيل، واستخدام الاستشارات والخدمات الرقمية. يرجى قراءة النسخة الكاملة داخل التطبيق قبل استخدام أي خدمة مدفوعة.</p>
        <h2>نطاق الخدمة</h2>
        <p>تقدم المنصة معلومات قانونية أولية وبحثاً نظامياً لأغراض معرفية وإرشادية. لا تمثل المخرجات رأياً قانونياً ملزماً أو تمثيلاً رسمياً أمام المحاكم أو الجهات الرسمية.</p>
        <h2>استخدام الحساب</h2>
        <p>يلتزم المستخدم بصحة بيانات التسجيل والمحافظة على سرية كلمة المرور وعدم رفع مستندات لا يملك الحق في مشاركتها.</p>
        <p><a href="mailto:info@rabablegal.com">استفسار عن الشروط</a></p>
      </section>`,
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function absoluteUrl(pathname) {
  return `${siteUrl}${pathname === '/' ? '/' : pathname}`;
}

function pageSchema(page) {
  if (page.schema) return page.schema;

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${absoluteUrl(page.pathname)}#webpage`,
      url: absoluteUrl(page.pathname),
      name: page.title.replace(' | RABAB LEGAL AI', ''),
      description: page.description,
      inLanguage: 'ar-SA',
      isPartOf: { '@id': `${siteUrl}/#website` },
    },
  ];
}

function renderDocument(page, assetTags) {
  const canonical = absoluteUrl(page.pathname);
  const robots = indexingEnabled ? 'index,follow,max-image-preview:large' : 'noindex,follow';
  const schema = JSON.stringify(pageSchema(page)).replaceAll('<', '\\u003c');

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="robots" content="${robots}" />
    <meta name="googlebot" content="${robots}" />
    <meta name="language" content="Arabic" />
    <meta name="geo.region" content="SA" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="RABAB LEGAL AI" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:locale" content="ar_SA" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
    <script type="application/ld+json">${schema}</script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
    ${assetTags.styles}
  </head>
  <body>
    <div id="root">
      <header class="bg-primary text-primary-foreground">
        <nav class="container mx-auto flex flex-wrap gap-4 px-4 py-5" aria-label="التنقل الرئيسي">
          <a href="/" class="font-bold">RABAB LEGAL AI</a>
          <a href="/about">من نحن</a>
          <a href="/pricing">الباقات</a>
          <a href="/faq">الأسئلة الشائعة</a>
          <a href="/contact">تواصل معنا</a>
        </nav>
      </header>
      <main class="container mx-auto max-w-4xl space-y-6 px-4 py-12 leading-loose text-foreground">
        <h1 class="text-4xl font-bold text-primary">${escapeHtml(page.title.replace(' | RABAB LEGAL AI', ''))}</h1>
        ${page.content}
      </main>
      <footer class="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
        <p>هذه المعلومات لأغراض معرفية وليست استشارة قانونية ملزمة.</p>
        <p><a href="/privacy">سياسة الخصوصية</a> · <a href="/terms">الشروط والأحكام</a></p>
      </footer>
    </div>
    ${assetTags.scripts}
  </body>
</html>`;
}

const viteTemplate = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
const styles = viteTemplate.match(/<link[^>]+rel="stylesheet"[^>]*>/g)?.join('\n    ') ?? '';
const scripts = viteTemplate.match(/<script[^>]+type="module"[^>]*><\/script>/g)?.join('\n    ') ?? '';

if (!styles || !scripts) {
  throw new Error('Vite asset tags were not found in the build output.');
}

for (const page of pages) {
  const relativeDirectory = page.pathname === '/' ? '' : page.pathname.slice(1);
  const outputDirectory = path.join(outputRoot, relativeDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'index.html'),
    renderDocument(page, { styles, scripts }),
    'utf8',
  );
}

console.log(`Generated ${pages.length} public HTML pages with indexing=${indexingEnabled}.`);
