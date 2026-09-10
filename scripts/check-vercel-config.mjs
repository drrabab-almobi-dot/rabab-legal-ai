import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

async function readJson(pathname) {
  return JSON.parse(await readFile(new URL(pathname, import.meta.url), "utf8"));
}

const rootConfig = await readJson("../vercel.json");
const apiConfig = await readJson("../artifacts/api-server/vercel.json");

assert.equal(
  rootConfig.framework,
  null,
  "root Vercel project must use the Other preset so Vite does not inject a catch-all SPA rewrite",
);
assert.equal(
  rootConfig.installCommand,
  "pnpm install --frozen-lockfile --prod=false",
);
assert.equal(rootConfig.outputDirectory, "artifacts/rabab-legal/dist/public");
assert.equal(
  rootConfig.redirects,
  undefined,
  "root Vercel routing must use one ordered routes pipeline",
);
assert.equal(
  rootConfig.rewrites,
  undefined,
  "root Vercel routing must use one ordered routes pipeline",
);
assert.equal(
  rootConfig.headers,
  undefined,
  "root Vercel routing must use one ordered routes pipeline",
);

const routes = rootConfig.routes ?? [];
const wwwRedirect = routes.find((route) =>
  route.has?.some(
    (condition) =>
      condition.type === "host" && condition.value === "www.rabablegal.com",
  ),
);
assert(wwwRedirect, "www requests must have a canonical-host redirect route");
assert.equal(wwwRedirect.status, 308);
assert.equal(wwwRedirect.headers?.Location, "https://rabablegal.com/$1");

const assetHeaders = routes.find(
  (route) =>
    route.src === "/assets/(.*)" &&
    route.headers?.["Cache-Control"] === "public, max-age=31536000, immutable",
);
assert(assetHeaders?.continue, "hashed assets must use immutable caching");

const securityHeaders = routes.find(
  (route) =>
    route.src === "/(.*)" &&
    route.continue === true &&
    route.headers?.["Content-Security-Policy"],
)?.headers;
assert(securityHeaders, "all frontend responses must receive security headers");
for (const [key, value] of [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Frame-Options", "DENY"],
]) {
  assert.equal(
    securityHeaders[key],
    value,
    `root frontend config must set ${key}`,
  );
}
assert.equal(
  securityHeaders["Content-Security-Policy-Report-Only"],
  undefined,
  "root frontend config must not leave CSP in report-only mode",
);

const apiRoute = routes.find((route) => route.src === "/api/(.*)");
assert.equal(
  apiRoute?.dest,
  "https://rabab-legal-ai-api.vercel.app/api/$1",
  "root Vercel config must proxy all /api/* requests to the dedicated API project",
);
assert.equal(
  apiRoute?.headers?.["x-vercel-enable-rewrite-caching"],
  "0",
  "root frontend config must disable proxy caching for API responses",
);

const filesystemIndex = routes.findIndex(
  (route) => route.handle === "filesystem",
);
assert(
  filesystemIndex >= 0,
  "static files must be checked before SPA fallback routes",
);

const spaRouteIndex = routes.findIndex((route) => route.dest === "/index.html");
assert(
  spaRouteIndex > filesystemIndex,
  "SPA routes must run after filesystem lookup",
);
const spaRoute = routes[spaRouteIndex];
const spaPattern = new RegExp(`^${spaRoute.src}$`);
for (const pathname of [
  "/appointment",
  "/packages",
  "/disclaimer",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/consultation",
  "/consultation/example-id",
  "/contracts",
  "/legal-search",
  "/legal-assistant",
  "/knowledge-search",
  "/services/judicial",
  "/payment",
  "/payment/callback",
  "/invoices/example-id",
  "/dashboard",
  "/account",
  "/usage-log",
  "/organization",
  "/join-org",
  "/admin",
  "/admin/users",
]) {
  assert(
    spaPattern.test(pathname),
    `known SPA route ${pathname} must load index.html`,
  );
}
for (const pathname of ["/__unknown__", "/api/health", "/asset.js"]) {
  assert(
    !spaPattern.test(pathname),
    `unknown or non-SPA route ${pathname} must not load index.html`,
  );
}

const notFoundIndex = routes.findIndex(
  (route) =>
    route.src === "/(.*)" && route.status === 404 && route.dest === "/404.html",
);
assert(
  notFoundIndex > spaRouteIndex,
  "generated 404.html must be the final fallback with HTTP status 404",
);
assert.equal(
  notFoundIndex,
  routes.length - 1,
  "404 fallback must be the final route",
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
