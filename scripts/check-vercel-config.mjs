import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

async function readJson(pathname) {
  return JSON.parse(await readFile(new URL(pathname, import.meta.url), "utf8"));
}

const rootConfig = await readJson("../vercel.json");
const apiConfig = await readJson("../artifacts/api-server/vercel.json");

assert.equal(
  rootConfig.installCommand,
  "pnpm install --frozen-lockfile --prod=false",
);
assert.equal(rootConfig.outputDirectory, "artifacts/rabab-legal/dist/public");
assert(
  rootConfig.rewrites?.some(
    (rewrite) =>
      rewrite.source === "/api/:path*" &&
      rewrite.destination ===
        "https://rabab-legal-ai-api.vercel.app/api/:path*",
  ),
  "root Vercel config must proxy all /api/* requests to the dedicated API project",
);
assert(
  rootConfig.redirects?.some(
    (redirect) =>
      redirect.has?.some(
        (condition) =>
          condition.type === "host" && condition.value === "www.rabablegal.com",
      ) &&
      redirect.destination === "https://rabablegal.com/:path*" &&
      redirect.permanent === true,
  ),
  "www requests must redirect permanently to the canonical non-www host",
);

const spaRewrites =
  rootConfig.rewrites?.filter(
    (rewrite) => rewrite.destination === "/index.html",
  ) ?? [];
for (const route of [
  "/login",
  "/register",
  "/consultation",
  "/services/:serviceId",
  "/dashboard",
  "/admin/:path*",
]) {
  assert(
    spaRewrites.some((rewrite) => rewrite.source === route),
    `known SPA route ${route} must load index.html`,
  );
}
assert(
  !spaRewrites.some(
    (rewrite) => rewrite.source === "/:path*" || rewrite.source === "/(.*)",
  ),
  "unknown frontend routes must not be rewritten to index.html; Vercel should return a real 404",
);
assert(
  rootConfig.headers?.some(
    (header) =>
      header.source === "/api/:path*" &&
      header.headers?.some(
        (entry) =>
          entry.key === "x-vercel-enable-rewrite-caching" &&
          entry.value === "0",
      ),
  ),
  "root Vercel config must disable proxy caching for API responses",
);
assert(
  rootConfig.headers?.some(
    (header) =>
      header.source === "/assets/:path*" &&
      header.headers?.some(
        (entry) =>
          entry.key === "Cache-Control" &&
          entry.value === "public, max-age=31536000, immutable",
      ),
  ),
  "hashed frontend assets must use immutable caching",
);
const securityHeaders =
  rootConfig.headers?.find((header) => header.source === "/:path*")?.headers ??
  [];
for (const [key, value] of [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Frame-Options", "DENY"],
]) {
  assert(
    securityHeaders.some((entry) => entry.key === key && entry.value === value),
    `root frontend config must set ${key}`,
  );
}
assert(
  securityHeaders.some(
    (entry) => entry.key === "Content-Security-Policy-Report-Only",
  ),
  "root frontend config must ship a CSP report-only baseline before enforcing CSP",
);
assert.equal(
  rootConfig.functions,
  undefined,
  "root frontend deployment must not include a local API function",
);

assert.equal(apiConfig.framework, null);
assert.equal(
  apiConfig.installCommand,
  "cd ../.. && pnpm install --frozen-lockfile --prod=false",
);
assert.equal(apiConfig.outputDirectory, "dist");
assert(
  apiConfig.routes?.some(
    (route) => route.src === "/(.*)" && route.dest === "/api/index.mjs",
  ),
  "API Vercel config must route requests to api/index.mjs",
);
assert.equal(
  apiConfig.functions?.["api/index.mjs"]?.includeFiles,
  "prompts/**",
);

await access(new URL("../artifacts/api-server/api/index.mjs", import.meta.url));
await access(
  new URL(
    "../artifacts/api-server/prompts/legal_system_prompt.md",
    import.meta.url,
  ),
);

console.log("Vercel configuration contract passed");
