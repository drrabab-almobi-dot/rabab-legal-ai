export type OwnerTestMode = "off" | "admin_only";

/**
 * Enables a closed testing phase without pausing the Vercel project. In this
 * mode, the API permits only authenticated administrators after the sign-in
 * endpoints; non-administrators cannot register, create data, or consume a
 * paid service. The feature is disabled unless explicitly configured.
 */
export function getOwnerTestMode(): OwnerTestMode {
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
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/google",
  "/auth/google/callback",
]);

export function isOwnerTestingPublicPath(path: string): boolean {
  return ownerTestingPublicPaths.has(path);
}
