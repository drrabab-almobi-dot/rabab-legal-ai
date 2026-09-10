import assert from "node:assert/strict";
import {
  getContractPdfTrialLimitError,
  TRIAL_PDF_PAGE_LIMIT,
} from "../lib/contract-page-limit.js";

let receivedUserId: number | null = null;
const trialError = await getContractPdfTrialLimitError(
  42,
  TRIAL_PDF_PAGE_LIMIT + 1,
  async (userId) => {
    receivedUserId = userId;
    return { isTrial: true };
  },
);

assert.equal(
  receivedUserId,
  42,
  "authenticated req.userId must reach quota lookup",
);
assert.deepEqual(trialError, {
  error: `يمكن للتجربة المجانية تحليل حتى ${TRIAL_PDF_PAGE_LIMIT} صفحات (الملف يحتوي على ${TRIAL_PDF_PAGE_LIMIT + 1} صفحة). اشترك للوصول الكامل.`,
  trialLimit: true,
  pageCount: TRIAL_PDF_PAGE_LIMIT + 1,
  limit: TRIAL_PDF_PAGE_LIMIT,
});

let paidLookupUserId: number | null = null;
const paidError = await getContractPdfTrialLimitError(
  77,
  TRIAL_PDF_PAGE_LIMIT + 5,
  async (userId) => {
    paidLookupUserId = userId;
    return { isTrial: false };
  },
);
assert.equal(paidLookupUserId, 77);
assert.equal(paidError, null, "paid users may extract longer PDFs");

let shortPdfLookupCalled = false;
const shortPdfError = await getContractPdfTrialLimitError(
  88,
  TRIAL_PDF_PAGE_LIMIT,
  async () => {
    shortPdfLookupCalled = true;
    return { isTrial: true };
  },
);
assert.equal(
  shortPdfLookupCalled,
  false,
  "short PDFs do not require a quota lookup",
);
assert.equal(shortPdfError, null);

console.log("✓ contract PDF trial page-limit identity checks passed");
