import { createHash, timingSafeEqual } from "node:crypto";

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

function sameSecret(left, right) {
  const leftDigest = digest(left);
  const rightDigest = digest(right);
  return timingSafeEqual(leftDigest, rightDigest);
}

function parsePreviousExpiry() {
  const value = process.env.MCP_FILES_TOKEN_PREVIOUS_EXPIRES_AT;
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function assertTokenConfiguration() {
  if (!process.env.MCP_FILES_TOKEN || process.env.MCP_FILES_TOKEN.length < 32) {
    // Keep the process alive so the artifact can report health and the main
    // platform can publish. authorizeBearerHeader() remains fail-closed when
    // the token is absent, so the bridge cannot serve files until configured.
    console.warn("MCP_FILES_TOKEN is not configured; MCP requests remain disabled.");
  }
}

export function tokenFingerprint(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function authorizeBearerHeader(header, now = Date.now()) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = header.slice("Bearer ".length).trim();
  if (!supplied || supplied.length > 4096) return false;

  const revoked = new Set(
    (process.env.MCP_FILES_TOKEN_REVOKED_HASHES || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (revoked.has(tokenFingerprint(supplied))) return false;

  const current = process.env.MCP_FILES_TOKEN;
  if (current && sameSecret(supplied, current)) return true;

  const previous = process.env.MCP_FILES_TOKEN_PREVIOUS;
  const previousExpiry = parsePreviousExpiry();
  return Boolean(previous && previousExpiry && previousExpiry > now && sameSecret(supplied, previous));
}