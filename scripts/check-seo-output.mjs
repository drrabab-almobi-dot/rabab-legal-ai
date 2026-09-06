import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.join(projectRoot, 'artifacts', 'rabab-legal');
const outputRoot = path.join(frontendRoot, 'dist', 'public');
const siteUrl = 'https://rabablegal.com';
const publicPaths = ['/', '/about', '/pricing', '/contact', '/faq', '/privacy', '/terms'];

function outputFile(pathname) {
  return pathname === '/'
    ? path.join(outputRoot, 'index.html')
    : path.join(outputRoot, pathname.slice(1), 'index.html');
}

for (const pathname of publicPaths) {
  const html = await readFile(outputFile(pathname), 'utf8');
  const canonical = `${siteUrl}${pathname === '/' ? '/' : pathname}`;

  assert.match(html, /<html lang="ar" dir="rtl">/, `${pathname} must declare Arabic language and RTL direction`);
  assert.match(html, /<h1[^>]*>[^<]{3,}[^<]*<\/h1>/, `${pathname} must include visible Arabic H1 content`);
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}"\\s*/?>`), `${pathname} must self-canonicalize`);
  assert.match(html, new RegExp(`<meta property="og:url" content="${canonical}"\\s*/?>`), `${pathname} must provide its own Open Graph URL`);
  assert.match(html, /<meta name="robots" content="noindex,follow"\s*\/?>(?:\n|$)/, `${pathname} must remain noindex until written legal-content approval`);
  assert.doesNotMatch(html, /www\.rabablegal\.com/, `${pathname} must not publish the unresolved www hostname`);
  assert.doesNotMatch(html, /og-image\.png/, `${pathname} must not reference a missing Open Graph image`);
}

const faqHtml = await readFile(outputFile('/faq'), 'utf8');
assert.match(faqHtml, /"@type":"FAQPage"/, 'FAQ structured data must appear on /faq');
const homeHtml = await readFile(outputFile('/'), 'utf8');
assert.doesNotMatch(homeHtml, /"@type":"FAQPage"/, 'FAQ structured data must not appear on the homepage');

const sitemap = await readFile(path.join(frontendRoot, 'public', 'sitemap.xml'), 'utf8');
for (const pathname of publicPaths) {
  const url = `${siteUrl}${pathname === '/' ? '/' : pathname}`;
  assert.match(sitemap, new RegExp(`<loc>${url}<\/loc>`), `sitemap must include ${pathname}`);
}
for (const blockedPath of ['/login', '/register', '/knowledge-search', '/admin']) {
  assert.doesNotMatch(sitemap, new RegExp(`<loc>${siteUrl}${blockedPath}`), `sitemap must exclude ${blockedPath}`);
}

const robots = await readFile(path.join(frontendRoot, 'public', 'robots.txt'), 'utf8');
assert.match(robots, /^Disallow: \/$/m, 'robots must keep the site hidden until P0 approval is recorded');
assert.match(robots, new RegExp(`Sitemap: ${siteUrl}/sitemap.xml`), 'robots must declare the sitemap for the controlled future release');

console.log('SEO static-output contract passed');
