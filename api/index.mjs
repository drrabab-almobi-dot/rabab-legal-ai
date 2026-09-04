let app;
try {
  app = (await import("../artifacts/api-server/dist/app.mjs")).default;
} catch (err) {
  console.error("Failed to load built artifact ../artifacts/api-server/dist/app.mjs");
  console.error("Make sure you ran the build step (pnpm run build) or that artifacts are present.");
  console.error("Original error:", err && err.stack ? err.stack : String(err));
  throw new Error("API startup failed: missing built artifact. Run the build or restore artifacts and retry.");
}
export default app;
