export type OwnerTestMode = "off" | "admin_only";

/**
 * Enables a closed testing phase without pausing the Vercel project. During
 * account recovery we keep production access open so the owner can create and
 * verify the replacement administrator account. Test suites may still exercise
 * the closed-mode behavior by setting NODE_ENV=test and OWNER_TEST_MODE.
 */
export function getOwnerTestMode(): OwnerTestMode {
  if (process.env.NODE_ENV !== "test") return "off";
  return process.env.OWNER_TEST_MODE?.trim().toLowerCase() === "admin_only"
    ? "admin_only"
    : "off";
}

export function isAdminOnlyTestingEnabled(): boolean {
  return getOwnerTestMode() === "admin_only";
}

export const ownerTestingPublicPaths = new Set([
  "/health",
  "/healthz",
  "/access-mode",
  "/auth/providers",
  "/auth/login",
  "/auth/logout",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/google",
  "/auth/google/callback",
]);

export function isOwnerTestingPublicPath(path: string): boolean {
  return ownerTestingPublicPaths.has(path);
}
