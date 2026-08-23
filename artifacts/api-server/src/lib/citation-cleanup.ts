/**
 * citation-cleanup.ts
 *
 * Pure helpers for the auto-cleanup step in extract-all-metadata.
 * Keeping them in their own module makes unit-testing possible without
 * importing the whole database or Express stack.
 */

/**
 * Returns true when a caseMetadata object should be erased because every one
 * of the three *core* judicial-identity fields (caseNumber, rulingNumber,
 * court) is null or empty.
 *
 * Fields that are *not* core (e.g. hijriDate, disputeSubject, deedNumber)
 * are intentionally ignored — their presence alone is not enough to keep a
 * metadata record that is missing all judicial identity.
 *
 * The SQL equivalent run during cleanup:
 *   (caseMetadata->>'caseNumber'  IS NULL OR caseMetadata->>'caseNumber'  = '')
 *   AND
 *   (caseMetadata->>'rulingNumber' IS NULL OR caseMetadata->>'rulingNumber' = '')
 *   AND
 *   (caseMetadata->>'court'        IS NULL OR caseMetadata->>'court'        = '')
 */
export function isCorruptCaseMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (meta == null) return false; // nothing to clean

  const empty = (v: unknown): boolean =>
    v == null || (typeof v === "string" && v.trim() === "");

  return (
    empty(meta["caseNumber"]) &&
    empty(meta["rulingNumber"]) &&
    empty(meta["court"])
  );
}
