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

  const app = await getApp();
  return app(request, response);
}
