const OFFICIAL_LEGAL_DOMAINS = new Set([
  "laws.boe.gov.sa",
  "moj.gov.sa",
  "laws.moj.gov.sa",
  "hrsd.gov.sa",
  "sama.gov.sa",
  "zatca.gov.sa",
  "saip.gov.sa",
  "rega.gov.sa",
  "mc.gov.sa",
  "commercialcourts.gov.sa",
  "bog.gov.sa",
  "pp.gov.sa",
  "cma.org.sa",
  "sba.gov.sa",
  "najiz.sa",
  "ejar.sa",
  "uaelegislation.gov.ae",
  "moj.gov.ae",
  "adjd.gov.ae",
  "almeezan.qa",
  "moj.gov.qa",
  "legalaffairs.gov.bh",
  "moj.gov.bh",
  "moj.gov.om",
  "moj.gov.kw",
]);

export function isOfficialLegalUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    for (const domain of OFFICIAL_LEGAL_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isTrustedOfficialWebResult(result: {
  url?: string;
  content?: string;
  score?: number;
  official?: boolean;
}): boolean {
  return (result.official === true || isOfficialLegalUrl(result.url))
    && (result.content?.trim().length ?? 0) >= 40
    && (result.score ?? 0) >= 0.3;
}
