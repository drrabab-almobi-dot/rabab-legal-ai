export const TRIAL_PDF_PAGE_LIMIT = 10;

export interface ContractExtractionQuotaStatus {
  isTrial: boolean;
}

export async function getContractPdfTrialLimitError(
  userId: number,
  pageCount: number,
  getQuotaStatus: (userId: number) => Promise<ContractExtractionQuotaStatus>,
  isExempt = false,
): Promise<{
  error: string;
  trialLimit: true;
  pageCount: number;
  limit: number;
} | null> {
  if (isExempt || pageCount <= TRIAL_PDF_PAGE_LIMIT) return null;

  const quotaStatus = await getQuotaStatus(userId);
  if (!quotaStatus.isTrial) return null;

  return {
    error: `يمكن للتجربة المجانية تحليل حتى ${TRIAL_PDF_PAGE_LIMIT} صفحات (الملف يحتوي على ${pageCount} صفحة). اشترك للوصول الكامل.`,
    trialLimit: true,
    pageCount,
    limit: TRIAL_PDF_PAGE_LIMIT,
  };
}
