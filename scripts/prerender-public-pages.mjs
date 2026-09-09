import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const frontendRoot = path.join(projectRoot, "artifacts", "rabab-legal");
const outputRoot = path.join(frontendRoot, "dist", "public");
const siteUrl = "https://rabablegal.com";
const indexingEnabled =
  process.env.PUBLIC_INDEXING?.trim().toLowerCase() === "true";

const faqCategories = JSON.parse(
  await readFile(path.join(frontendRoot, "src", "content", "faq.json"), "utf8"),
);

const pages = [
  {
    pathname: "/",
    title: "استشارة قانونية بالذكاء الاصطناعي | RABAB LEGAL AI",
    description:
      "RABAB LEGAL AI منصة قانونية رقمية تقدم معلومات قانونية أولية موثقة في الأنظمة السعودية والخليجية، مع خدمات الاستشارات وتحليل العقود والبحث القانوني.",
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
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: "RABAB LEGAL AI",
        url: siteUrl,
        description:
          "منصة قانونية رقمية تقدم معلومات قانونية أولية موثقة في الأنظمة السعودية والخليجية.",
        email: "info@rabablegal.com",
        telephone: "+966504647649",
        sameAs: ["https://rabablawyer.sa"],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "info@rabablegal.com",
          telephone: "+966504647649",
          availableLanguage: ["Arabic", "English"],
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "RABAB LEGAL AI",
        url: siteUrl,
        inLanguage: "ar-SA",
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  },
  {
    pathname: "/about",
    title: "من نحن | RABAB LEGAL AI",
    description:
      "تعرّف على RABAB LEGAL AI، المنصة القانونية الرقمية المتخصصة في الأنظمة السعودية والخليجية تحت إشراف مهني مباشر.",
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
    pathname: "/pricing",
    title: "الأسعار والباقات | RABAB LEGAL AI",
    description:
      "استعرض باقات RABAB LEGAL AI للاستشارات القانونية الرقمية وتحليل العقود والبحث القانوني قبل البدء بالخدمة.",
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
    pathname: "/contact",
    title: "تواصل معنا | RABAB LEGAL AI",
    description:
      "تواصل مع فريق RABAB LEGAL AI للاستفسارات العامة والدعم المتعلق بالمنصة القانونية الرقمية.",
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
    pathname: "/faq",
    title: "الأسئلة الشائعة | RABAB LEGAL AI",
    description:
      "إجابات الأسئلة الشائعة حول RABAB LEGAL AI، ونطاق المعلومات القانونية الرقمية، والحسابات والباقات والخصوصية.",
    content: `<section><p>إجابات على الأسئلة المتكررة حول المنصة وخدماتها الرقمية.</p>${faqCategories
      .map(
        (category) =>
          `<section><h2>${escapeHtml(category.title)}</h2>${category.faqs
            .map(
              (faq) =>
                `<details><summary>${escapeHtml(faq.q)}</summary><p>${escapeHtml(faq.a)}</p></details>`,
            )
            .join("")}</section>`,
      )
      .join("")}</section>`,
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "@id": `${siteUrl}/faq#faqpage`,
        mainEntity: faqCategories.flatMap((category) =>
          category.faqs.map((faq) => ({
            "@type": "Question",
            name: faq.q,
            acceptedAnswer: { "@type": "Answer", text: faq.a },
          })),
        ),
      },
    ],
  },
  {
    pathname: "/privacy",
    title: "سياسة الخصوصية | RABAB LEGAL AI",
    description:
      "سياسة خصوصية RABAB LEGAL AI المتعلقة بجمع بيانات الحساب والخدمة واستخدامها وحمايتها وحقوق المستخدم.",
    content: `
      <section>
        <p><strong>آخر تحديث: يوليو 2026.</strong> توضح هذه السياسة كيفية جمع بياناتك واستخدامها وحمايتها عند استخدام RABAB LEGAL AI.</p>
        <h2>المعلومات التي نجمعها</h2>
        <p>نجمع بيانات الحساب مثل الاسم والبريد الإلكتروني ورقم الجوال وكلمة المرور المشفرة، وبيانات الخدمة مثل محتوى الاستشارات والمستندات المرفوعة ونشاط الجلسات، وبيانات تقنية مثل عنوان IP ونوع المتصفح لأغراض الأمن والأداء.</p>
        <h2>أغراض الاستخدام</h2>
        <p>نستخدم البيانات لتقديم الخدمة وتحسينها، ومعالجة طلبات الاستشارة والاشتراكات والمدفوعات، وإرسال إشعارات الخدمة، وحماية الحساب. وفق السياسة المعلنة، لا تُستخدم بيانات الاستشارات لتدريب نماذج الذكاء الاصطناعي ولا تباع البيانات.</p>
        <h2>المشاركة والأمن</h2>
        <p>قد تُشارك البيانات بالحد الأدنى الضروري مع مزودي الخدمة، مثل الاستضافة والدفع، أو استجابةً لأمر قضائي ملزم. تستخدم المنصة HTTPS للاتصالات وتطبق ضوابط وصول ونسخاً احتياطية مشفرة وفق السياسة المعلنة.</p>
        <h2>ملفات الارتباط والاحتفاظ</h2>
        <p>تستخدم ملفات جلسة ضرورية للدخول وتقنيات لقياس الأداء. تُحفظ بيانات الحساب ما دام نشطاً، وتوضح السياسة أن طلب حذف الحساب ينفذ خلال 30 يوماً، مع إمكان الاحتفاظ بسجلات مالية وفق المتطلبات النظامية.</p>
        <h2>حقوق المستخدم</h2>
        <p>يمكن طلب الوصول إلى البيانات أو تصحيحها أو حذف الحساب والبيانات أو الاعتراض على المعالجة عبر <a href="mailto:info@rabablegal.com">info@rabablegal.com</a> أو الهاتف <a href="tel:+966504647649">+966 50 464 7649</a>.</p>
        <h2>القاصرون والتحديثات</h2>
        <p>الخدمة مخصصة لمن بلغوا 18 عاماً. تُحذف بيانات القاصر المقدمة دون إذن ولي الأمر عند العلم بها. تُرسل إشعارات التغييرات الجوهرية إلى البريد المسجل قبل نفاذها وفق السياسة.</p>
      </section>`,
  },
  {
    pathname: "/terms",
    title: "الشروط والأحكام | RABAB LEGAL AI",
    description:
      "شروط استخدام RABAB LEGAL AI ونطاق المعلومات القانونية الرقمية والحسابات والاشتراكات والوثائق.",
    content: `
      <section>
        <p><strong>آخر تحديث: يوليو 2026.</strong> باستخدام المنصة يوافق المستخدم على الشروط التالية، ويجب التوقف عن الاستخدام عند عدم الموافقة.</p>
        <h2>وصف الخدمة وإخلاء المسؤولية</h2>
        <p>تقدم المنصة معلومات قانونية أولية وبحثاً نظامياً في أنظمة دول مجلس التعاون الخليجي لأغراض معرفية وإرشادية. لا تمثل المخرجات رأياً قانونياً ملزماً أو تمثيلاً رسمياً أمام المحاكم أو الجهات الرسمية، ولا تغني عن الرجوع إلى محامٍ مرخص.</p>
        <h2>الأهلية والحساب</h2>
        <p>يجب أن يكون المستخدم بعمر 18 سنة أو أكثر، وأن يقدم بيانات صحيحة ويحافظ على سرية كلمة المرور ويبلغ فوراً عن أي استخدام غير مصرح.</p>
        <h2>الاستخدام المقبول</h2>
        <p>يُسمح بالاستخدام الشخصي والبحث والدراسة وتحليل المستندات التي يملك المستخدم حق رفعها. يُحظر الانتحال والمحتوى المخالف ومحاولات الاختراق والاستخراج الآلي وإعادة البيع أو التوزيع دون إذن.</p>
        <h2>الاشتراكات والمدفوعات</h2>
        <p>تتضمن الباقة التجريبية ثلاث تجارب مرة واحدة لكل مستخدم. يُحتسب الاستخدام بعد إجابة ناجحة. تراجع الإدارة طلبات الاسترداد وفق الحالات المحددة، وتجدد الباقات الشهرية تلقائياً ما لم تُلغ قبل 48 ساعة من التجديد. الأسعار المعروضة شاملة ضريبة القيمة المضافة وفق الشروط المنشورة.</p>
        <h2>المستندات والملكية الفكرية</h2>
        <p>يقر المستخدم بامتلاكه حق رفع المستندات أو حصوله على الإذن اللازم. لا يجوز رفع كلمات مرور أو بيانات بنكية أو معلومات شخصية حساسة لأطراف أخرى. تخضع محتويات وتصميم المنصة لحقوق الملكية الفكرية المبينة في الشروط.</p>
        <h2>تعليق الحساب والتعديلات والاختصاص</h2>
        <p>يجوز تعليق الحساب عند مخالفة الشروط. تُخطر التغييرات الجوهرية قبل نفاذها وفق الشروط. تخضع الشروط للأنظمة المعمول بها في المملكة العربية السعودية، وتبين الصفحة الكاملة مسار معالجة النزاعات.</p>
        <p><a href="mailto:info@rabablegal.com">استفسار عن الشروط</a></p>
      </section>`,
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function absoluteUrl(pathname) {
  return `${siteUrl}${pathname === "/" ? "/" : pathname}`;
}

function pageSchema(page) {
  if (page.schema) return page.schema;

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${absoluteUrl(page.pathname)}#webpage`,
      url: absoluteUrl(page.pathname),
      name: page.title.replace(" | RABAB LEGAL AI", ""),
      description: page.description,
      inLanguage: "ar-SA",
      isPartOf: { "@id": `${siteUrl}/#website` },
    },
  ];
}

function renderDocument(page, assetTags) {
  const canonical = absoluteUrl(page.pathname);
  const robots =
    page.robots ??
    (indexingEnabled
      ? "index,follow,max-image-preview:large"
      : "noindex,follow");
  const schema = JSON.stringify(pageSchema(page)).replaceAll("<", "\\u003c");

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
        <h1 class="text-4xl font-bold text-primary">${escapeHtml(page.title.replace(" | RABAB LEGAL AI", ""))}</h1>
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

const viteTemplate = await readFile(
  path.join(outputRoot, "index.html"),
  "utf8",
);
const styles =
  viteTemplate.match(/<link[^>]+rel="stylesheet"[^>]*>/g)?.join("\n    ") ?? "";
const scripts =
  viteTemplate
    .match(/<script[^>]+type="module"[^>]*><\/script>/g)
    ?.join("\n    ") ?? "";

if (!styles || !scripts) {
  throw new Error("Vite asset tags were not found in the build output.");
}

for (const page of pages) {
  const relativeDirectory = page.pathname === "/" ? "" : page.pathname.slice(1);
  const outputDirectory = path.join(outputRoot, relativeDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "index.html"),
    renderDocument(page, { styles, scripts }),
    "utf8",
  );
}

const notFoundPage = {
  pathname: "/404",
  title: "الصفحة غير موجودة | RABAB LEGAL AI",
  description: "تعذر العثور على الصفحة المطلوبة في منصة RABAB LEGAL AI.",
  robots: "noindex,follow",
  content: `
    <section>
      <p>عذراً، الرابط الذي فتحته غير صحيح أو نُقلت الصفحة.</p>
      <p><a href="/">العودة إلى الصفحة الرئيسية</a> · <a href="/contact">تواصل معنا</a></p>
    </section>`,
};

await writeFile(
  path.join(outputRoot, "404.html"),
  renderDocument(notFoundPage, { styles, scripts }),
  "utf8",
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((page) => `  <url><loc>${absoluteUrl(page.pathname)}</loc></url>`).join("\n")}
</urlset>
`;

const robots = indexingEnabled
  ? `# Public marketing pages are approved for indexing.\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /account\nDisallow: /payment\nDisallow: /invoices\nDisallow: /organization\nDisallow: /usage-log\n\nSitemap: ${siteUrl}/sitemap.xml\n`
  : `# Private testing mode: keep the site out of search results.\nUser-agent: *\nDisallow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;

await writeFile(path.join(outputRoot, "sitemap.xml"), sitemap, "utf8");
await writeFile(path.join(outputRoot, "robots.txt"), robots, "utf8");

console.log(
  `Generated ${pages.length} public HTML pages with indexing=${indexingEnabled}.`,
);
