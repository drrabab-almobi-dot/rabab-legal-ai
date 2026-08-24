import { createRequire } from "node:module";

type GlobalWithRequire = typeof globalThis & {
  require?: (id: string) => unknown;
};

type AppHandler = (req: unknown, res: unknown, next?: unknown) => unknown;

let appPromise: Promise<AppHandler> | undefined;

function loadApp(): Promise<AppHandler> {
  const globalWithRequire = globalThis as GlobalWithRequire;
  globalWithRequire.require ??= createRequire(import.meta.url);

  appPromise ??= import("../artifacts/api-server/src/app").then(({ default: app }) => app as AppHandler);
  return appPromise;
}

export default async function handler(req: unknown, res: unknown, next?: unknown) {
  const app = await loadApp();
  return app(req, res, next);
}