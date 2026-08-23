/**
 * Builds a single test file with esbuild (same settings as build.mjs) and runs it.
 * Usage:  node test-build.mjs <src/path/to/file.test.ts>
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

const entryRel = process.argv[2];
if (!entryRel) {
  console.error("Usage: node test-build.mjs <src/path/to/file.test.ts>");
  process.exit(1);
}

const entryAbs = path.resolve(artifactDir, entryRel);
const distDir  = path.resolve(artifactDir, "dist-test");

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

await esbuild({
  entryPoints: [entryAbs],
  platform: "node",
  bundle: true,
  format: "esm",
  outdir: distDir,
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  external: [
    "*.node", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt", "argon2",
    "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil", "utf-8-validate",
    "ssh2", "cpu-features", "dtrace-provider", "isolated-vm", "lightningcss",
    "pg-native", "oracledb", "mongodb-client-encryption", "nodemailer", "handlebars",
    "knex", "typeorm", "protobufjs", "onnxruntime-node", "@tensorflow/*",
    "@prisma/client", "@mikro-orm/*", "@grpc/*", "@swc/*", "@aws-sdk/*", "@azure/*",
    "@opentelemetry/*", "@google-cloud/*", "@google/*", "googleapis", "firebase-admin",
    "@parcel/watcher", "@sentry/profiling-node", "@tree-sitter/*", "aws-sdk",
    "classic-level", "dd-trace", "ffi-napi", "grpc", "hiredis", "kerberos",
    "leveldown", "miniflare", "mysql2", "newrelic", "odbc", "piscina", "realm",
    "ref-napi", "rocksdb", "sass-embedded", "sequelize", "serialport", "snappy",
    "tinypool", "usb", "workerd", "wrangler", "zeromq", "zeromq-prebuilt",
    "playwright", "puppeteer", "puppeteer-core", "electron",
    // pdfkit → fontkit → brotli → @swc/helpers CJS shim; keep all three external
    // so they resolve from node_modules at runtime instead of being inlined.
    "pdfkit", "fontkit", "@swc/helpers",
  ],
  sourcemap: "linked",
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
  },
});

// Derive output file name: src/routes/auth.test.ts → dist-test/auth.test.mjs
const baseName   = path.basename(entryAbs, ".ts");
const outFile    = path.resolve(distDir, `${baseName}.mjs`);

const child = spawn(process.execPath, ["--enable-source-maps", outFile], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
