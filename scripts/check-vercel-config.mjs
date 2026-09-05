import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

async function readJson(pathname) {
  return JSON.parse(await readFile(new URL(pathname, import.meta.url), "utf8"));
}

const rootConfig = await readJson("../vercel.json");
const apiConfig = await readJson("../artifacts/api-server/vercel.json");

assert.equal(rootConfig.installCommand, "pnpm install --frozen-lockfile --prod=false");
assert.equal(rootConfig.outputDirectory, "artifacts/rabab-legal/dist/public");
assert(rootConfig.rewrites?.some(
  (rewrite) => rewrite.source === "/api/:path*" && rewrite.destination === "/api/index.mjs",
), "root Vercel config must rewrite all /api/* requests to api/index.mjs");
assert.equal(
  rootConfig.functions?.["api/index.mjs"]?.includeFiles,
  "artifacts/api-server/prompts/**",
);

assert.equal(apiConfig.framework, null);
assert.equal(apiConfig.installCommand, "cd ../.. && pnpm install --frozen-lockfile --prod=false");
assert.equal(apiConfig.outputDirectory, "dist");
assert(apiConfig.routes?.some(
  (route) => route.src === "/(.*)" && route.dest === "/api/index.mjs",
), "API Vercel config must route requests to api/index.mjs");
assert.equal(apiConfig.functions?.["api/index.mjs"]?.includeFiles, "prompts/**");

await access(new URL("../api/index.mjs", import.meta.url));
await access(new URL("../artifacts/api-server/api/index.mjs", import.meta.url));
await access(new URL("../artifacts/api-server/prompts/legal_system_prompt.md", import.meta.url));

console.log("Vercel configuration contract passed");
