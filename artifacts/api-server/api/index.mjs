let appPromise;

function getApp() {
  appPromise ??= import("../dist/app.mjs").then(({ default: app }) => app);
  return appPromise;
}

export default async function handler(request, response) {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

  if (pathname === "/api/health" || pathname === "/api/healthz") {
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const missingConfiguration = ["DATABASE_URL", "SESSION_SECRET"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingConfiguration.length > 0) {
    console.error("API configuration is incomplete", { missingConfiguration });
    response.statusCode = 503;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      error: "الخدمة غير متاحة مؤقتاً.",
      code: "SERVICE_MISCONFIGURED",
    }));
    return;
  }

  try {
    const app = await getApp();
    return app(request, response);
  } catch (error) {
    console.error("Failed to initialize API application", error);
    if (!response.headersSent) {
      response.statusCode = 503;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        error: "الخدمة غير متاحة مؤقتاً.",
        code: "SERVICE_INITIALIZATION_FAILED",
      }));
    }
  }
}
