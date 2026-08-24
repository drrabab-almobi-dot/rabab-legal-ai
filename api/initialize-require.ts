import { createRequire } from "node:module";

type GlobalWithRequire = typeof globalThis & {
  require?: (id: string) => unknown;
};

const globalWithRequire = globalThis as GlobalWithRequire;
globalWithRequire.require ??= createRequire(import.meta.url);