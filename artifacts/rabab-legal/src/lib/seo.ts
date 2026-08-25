/**
 * SEO helpers — update document title + meta description per page.
 * Call setPageSEO() at the top of each page component (not in hooks to avoid deps issues).
 */

import { translateArabicText } from './translations';

const SITE_NAME = "RABAB LEGAL AI";
const DEFAULT_DESCRIPTION =
  "منصة رقمية متطورة تقدم استشارات قانونية دقيقة وموثقة للأفراد والشركات في المملكة العربية السعودية ودول مجلس التعاون — مدعومة بالذكاء الاصطناعي.";

export interface PageSEO {
  title: string;          // page-specific title (Arabic ok)
  description?: string;
  canonical?: string;
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function setPageSEO({ title, description = DEFAULT_DESCRIPTION, canonical }: PageSEO) {
  const isEnglish = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  const localizedTitle = isEnglish ? translateArabicText(title) : title;
  const localizedDescription = isEnglish ? translateArabicText(description) : description;
  const fullTitle = `${localizedTitle} | ${SITE_NAME}`;
  document.title = fullTitle;

  setMeta("description", localizedDescription);
  setMeta("og:title", fullTitle, "property");
  setMeta("og:description", localizedDescription, "property");
  setMeta("twitter:title", fullTitle, "name");
  setMeta("twitter:description", localizedDescription, "name");

  if (canonical) {
    setLink("canonical", canonical);
    setMeta("og:url", canonical, "property");
  }
}
