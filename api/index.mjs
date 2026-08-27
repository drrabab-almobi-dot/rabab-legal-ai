import express from "express";

const proxy = express();
let appPromise;

async function loadApp() {
  if (!appPromise) {
    appPromise = import("../artifacts/api-server/dist/app.mjs").then((mod) => {
      mod.markAppReady();
      return mod.default;
    });
  }
  return appPromise;
}

proxy.use(async (req, res, next) => {
  try {
    const app = await loadApp();
    return app(req, res, next);
  } catch (err) {
    console.error("RABAB API bootstrap failed", err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: "تعذر تشغيل الخادم الخلفي",
        code: "API_BOOTSTRAP_FAILED",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return next(err);
  }
});

export default proxy;
