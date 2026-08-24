import { createRequire } from "node:module";
import type { RequestHandler } from "express";

type GlobalWithRequire = typeof globalThis & {
  require?: NodeRequire;
};

let appPromise: Promise<RequestHandler> | undefined;

function loadApp(): Promise<RequestHandler> {
  const globalWithRequire = globalThis as GlobalWithRequire;
  globalWithRequire.require ??= createRequire(import.meta.url);

  appPromise ??= import("../artifacts/api-server/src/app.ts").then(({ default: app }) => app);
  return appPromise;
}

export default async function handler(...args: Parameters<RequestHandler>) {
  const app = await loadApp();
  return app(...args);
}