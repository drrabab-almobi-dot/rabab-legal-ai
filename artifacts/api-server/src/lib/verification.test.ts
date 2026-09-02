import assert from "node:assert/strict";
import { isOfficialLegalUrl } from "./legal-source-trust.js";
import { verifyArticles, verifyResponse } from "./verification.js";

const official = {
  title: "هيئة الخبراء",
  url: "https://laws.boe.gov.sa/example",
  content: "نظام العمل المادة 80 ويعمل به من تاريخ 1445هـ",
  score: 0.8,
};

assert.equal(isOfficialLegalUrl("https://laws.boe.gov.sa/a"), true);
assert.equal(isOfficialLegalUrl("https://laws.boe.gov.sa.evil.example/a"), false);
assert.equal(isOfficialLegalUrl("http://laws.boe.gov.sa/a"), false);

const secondaryOnly = verifyResponse(
  "وفق المادة 80 من نظام العمل لسنة 1445هـ",
  [],
  [{ ...official, url: "https://qanoniah.com/post", official: false }],
);
assert.equal(secondaryOnly.summary.sufficientSources, false);
assert.ok(secondaryOnly.summary.blockedCount >= 1);

const officialResult = verifyResponse(
  "وفق المادة 80 من نظام العمل ويعمل به من تاريخ 1445هـ",
  [],
  [official],
);
assert.equal(officialResult.summary.sufficientSources, true);
assert.equal(officialResult.summary.blockedCount, 0);

const wrongArticle = verifyArticles([
  { law: "نظام العمل", article: "81", text: "", relevance: "" },
], [], [official]);
assert.equal(wrongArticle[0]?.verified, false);

const correctArticle = verifyArticles([
  { law: "نظام العمل", article: "80", text: "", relevance: "" },
], [], [official]);
assert.equal(correctArticle[0]?.verified, true);

console.log("verification safety tests passed");
