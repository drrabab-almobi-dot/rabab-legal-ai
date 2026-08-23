import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(artifactDirectory, "dist");
const serverModules = ["auth.mjs", "file-policy.mjs", "mcp-protocol.mjs", "server.mjs", "zip.mjs"];

await mkdir(distDirectory, { recursive: true });
for (const moduleName of serverModules) {
  await cp(path.join(artifactDirectory, "src", moduleName), path.join(distDirectory, moduleName));
  await rm(path.join(distDirectory, `${moduleName}.map`), { force: true });
}