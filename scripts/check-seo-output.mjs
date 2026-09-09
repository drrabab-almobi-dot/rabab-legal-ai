import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const frontendRoot = path.join(projectRoot, "artifacts", "rabab-legal");
const outputRoot = path.join(frontendRoot, "dist", "public");
const siteUrl = "https://rabablegal.com";
const publicPaths = [
  "/",
  "/about",
  "/pricing",
  "/contact",
  "/faq",
  "/privacy",
  "/terms",
];
const indexingEnabled =
  process.env.PUBLIC_INDEXING?.trim().toLowerCase() === "true";

function outputFile(pathname) {
  return pathname === "/"
    ? path.join(outputRoot, "index.html")
    : path.join(outputRoot, pathname.slice(1), "index.html");
}

for (const pathname of publicPaths) {
  const html = await readFile(outputFile(pathname), "utf8");
  const canonical = `${siteUrl}${pathname === "/" ? "/" : pathname}`;

  assert.match(
    html,
    /<html lang="ar" dir="rtl">/,
    `${pathname} must declare Arabic language and RTL direction`,
  );
  assert.match(
    html,
    /<h1[^>]*>[^<]{3,}[^<]*<\/h1>/,
    `${pathname} must include visible Arabic H1 content`,
  );
  assert.match(
    html,
    new RegExp(`<link rel="canonical" href="${canonical}"\\s*/?>`),
    `${pathname} must self-canonicalize`,
  );
  assert.match(
    html,
    new RegExp(`<meta property="og:url" content="${canonical}"\\s*/?>`),
    `${pathname} must provide its own Open Graph URL`,
  );
  const expectedRobots = indexingEnabled
    ? "index,follow,max-image-preview:large"
    : "noindex,follow";
  assert.match(
    html,
    new RegExp(
      `<meta name="robots" content="${expectedRobots}"\\s*\\/?>(?:\\n|$)`,
    ),
    `${pathname} must match the PUBLIC_INDEXING release flag`,
  );
  assert.doesNotMatch(
    html,
    /www\.rabablegal\.com/,
    `${pathname} must not publish the unresolved www hostname`,
  );
  assert.doesNotMatch(
    html,
    /og-image\.png/,
    `${pathname} must not reference a missing Open Graph image`,
  );
}

const faqHtml = await readFile(outputFile("/faq"), "utf8");
assert.match(
  faqHtml,
  /"@type":"FAQPage"/,
  "FAQ structured data must appear on /faq",
);
const homeHtml = await readFile(outputFile("/"), "utf8");
assert.doesNotMatch(
  homeHtml,
  /"@type":"FAQPage"/,
  "FAQ structured data must not appear on the homepage",
);

const notFoundHtml = await readFile(path.join(outputRoot, "404.html"), "utf8");
assert.match(
  notFoundHtml,
  /<title>الصفحة غير موجودة \| RABAB LEGAL AI<\/title>/,
  "a custom Arabic 404 page must be generated",
);
assert.match(
  notFoundHtml,
  /<meta name="robots" content="noindex,follow"/,
  "the 404 page must never be indexed",
);

const sitemap = await readFile(path.join(outputRoot, "sitemap.xml"), "utf8");
for (const pathname of publicPaths) {
  const url = `${siteUrl}${pathname === "/" ? "/" : pathname}`;
  assert.match(
    sitemap,
    new RegExp(`<loc>${url}<\/loc>`),
    `sitemap must include ${pathname}`,
  );
}
for (const blockedPath of [
  "/login",
  "/register",
  "/knowledge-search",
  "/admin",
]) {
  assert.doesNotMatch(
    sitemap,
    new RegExp(`<loc>${siteUrl}${blockedPath}`),
    `sitemap must exclude ${blockedPath}`,
  );
}

const robots = await readFile(path.join(outputRoot, "robots.txt"), "utf8");
if (indexingEnabled) {
  assert.match(
    robots,
    /^Allow: \/$/m,
    "public builds must allow the marketing site to be crawled",
  );
  for (const blockedPath of [
    "/admin",
    "/dashboard",
    "/account",
    "/payment",
    "/invoices",
    "/organization",
    "/usage-log",
  ]) {
    assert.match(
      robots,
      new RegExp(`^Disallow: ${blockedPath}$`, "m"),
      `public builds must block ${blockedPath}`,
    );
  }
} else {
  assert.match(
    robots,
    /^Disallow: \/$/m,
    "private-test builds must keep the site hidden",
  );
}
assert.match(
  robots,
  new RegExp(`Sitemap: ${siteUrl}/sitemap.xml`),
  "robots must declare the sitemap for the controlled future release",
);

console.log(
  `SEO static-output contract passed with indexing=${indexingEnabled}`,
);
