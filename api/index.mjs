import express from "express";
import app from "../artifacts/api-server/dist/app.mjs";

// Keep an explicit Express import in the Vercel function entrypoint so Vercel
// detects this file as the server entry instead of rejecting the built app.
void express;

export default app;
