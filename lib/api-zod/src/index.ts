// Both generated modules define RegisterResponse: the API module exports its
// Zod schema while the types module exports the TypeScript response union.
// Resolve that name explicitly so consumers can import both without an
// ambiguous star-export error.
export { RegisterResponse } from "./generated/api";
export type { RegisterResponse as RegisterResponseType } from "./generated/types/authResponse";
export * from "./generated/api";
export * from "./generated/types";
