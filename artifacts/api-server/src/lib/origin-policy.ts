const vercelFrontendPreviewOrigin = /^https:\/\/rabab-legal(?:-ai)?(?:-[a-z0-9-]+)?-drrabab-almobi-2417s-projects\.vercel\.app$/;

export function createAllowedOrigins(configuredOrigins?: string): Set<string> {
  return new Set(
    [
      "https://rabablegal.com",
      "https://www.rabablegal.com",
      "https://rabab-legal.vercel.app",
      "https://rabab-legal-ai.vercel.app",
      ...(configuredOrigins ?? "").split(","),
    ]
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

/**
 * Allows only the canonical public domain, configured trusted origins, and
 * preview hosts belonging to this frontend project and Vercel team. Keeping the
 * rule central prevents authentication, CORS, and CSRF policies from drifting.
 */
export function isTrustedFrontendOrigin(origin: string, configuredOrigins?: string): boolean {
  return createAllowedOrigins(configuredOrigins).has(origin) || vercelFrontendPreviewOrigin.test(origin);
}
