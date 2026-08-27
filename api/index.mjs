import express from "express";
import app, { markAppReady } from "../artifacts/api-server/dist/app.mjs";

// Keep an explicit Express import in the Vercel function entrypoint so Vercel
// detects this file as the server entry instead of rejecting the built app.
void express;

// Vercel functions do not execute the long-running src/index.ts startup loop.
// Mark the app ready here so authenticated API routes are not permanently 503.
markAppReady();

export default app;
