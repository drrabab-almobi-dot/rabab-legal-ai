import express, { type Express, type Request, type Response, type NextFunction, type Router } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";

const PgStore = connectPgSimple(session);

const app: Express = express();
// Serverless Vercel functions do not execute src/index.ts, so they are ready
// immediately after module initialization. Long-running hosts still call
// markAppReady() after their startup checks and migrations finish.
let appReady = process.env.VERCEL === "1";

export function markAppReady(): void {
  appReady = true;
}

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const missingCoreConfig = [
  !sessionSecret ? "SESSION_SECRET" : null,
  !databaseUrl ? "DATABASE_URL" : null,
].filter((value): value is string => Boolean(value));

// Health is intentionally available before session/database middleware so a
// deployment with incomplete environment configuration reports the exact
// missing variable names instead of crashing as FUNCTION_INVOCATION_FAILED.
app.get("/api/healthz", (_req: Request, res: Response): void => {
  if (missingCoreConfig.length > 0) {
    res.status(503).json({
      ok: false,
      code: "CONFIG_INCOMPLETE",
      missing: missingCoreConfig,
      environment: process.env.VERCEL === "1" ? "vercel" : "server",
    });
    return;
  }
  res.status(200).json({ ok: true, environment: process.env.VERCEL === "1" ? "vercel" : "server" });
});

function classifyDatabaseError(err: unknown): string {
  const e = err as { code?: string; message?: string } | undefined;
  const code = String(e?.code ?? "").toUpperCase();
  const message = String(e?.message ?? "").toLowerCase();

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || message.includes("getaddrinfo")) return "DATABASE_DNS_FAILED";
  if (code === "ETIMEDOUT" || message.includes("timeout")) return "DATABASE_TIMEOUT";
  if (code === "ECONNREFUSED") return "DATABASE_REFUSED";
  if (code === "28P01" || message.includes("password authentication failed")) return "DATABASE_AUTH_FAILED";
  if (code === "3D000") return "DATABASE_NAME_INVALID";
  if (message.includes("certificate") || message.includes("ssl") || message.includes("tls")) return "DATABASE_TLS_FAILED";
  return "DATABASE_UNAVAILABLE";
}

// Database connectivity probe. It never returns credentials, hostnames, or raw
// SQL errors. It exposes only a coarse failure category for operational diagnosis.
app.get("/api/db-health", async (req: Request, res: Response): Promise<void> => {
  if (!databaseUrl) {
    res.status(503).json({ ok: false, code: "DATABASE_CONFIG_MISSING" });
    return;
  }

  try {
    const { pool } = await import("@workspace/db");
    await pool.query("select 1");
    res.status(200).json({ ok: true, database: "reachable" });
  } catch (err) {
    const code = classifyDatabaseError(err);
    (req as any).log?.error({ err, databaseErrorCode: code }, "Database health check failed");
    logger.error({ err, databaseErrorCode: code }, "Database health check failed");
    res.status(503).json({ ok: false, code });
  }
});

if (sessionSecret && databaseUrl) {
  const isHostedHttps = process.env.VERCEL === "1" || !!process.env.REPL_ID || process.env.NODE_ENV === "production";
  app.use(
    session({
      store: new PgStore({
        conString: databaseUrl,
        tableName: "session",
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isHostedHttps,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: isHostedHttps ? "none" : "lax",
      },
    }),
  );
}

let routerPromise: Promise<Router> | undefined;
async function getRouter(): Promise<Router> {
  if (!routerPromise) {
    routerPromise = import("./routes").then((mod) => mod.default as Router);
  }
  return routerPromise;
}

app.use("/api", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (missingCoreConfig.length > 0) {
    res.status(503).json({
      error: "إعدادات تشغيل الخادم غير مكتملة",
      code: "CONFIG_INCOMPLETE",
      missing: missingCoreConfig,
    });
    return;
  }

  if (!appReady) {
    res.status(503).json({
      error: "الخادم قيد التجهيز. يرجى المحاولة بعد لحظات.",
      code: "SERVICE_STARTING",
    });
    return;
  }

  try {
    const router = await getRouter();
    router(req, res, next);
  } catch (err) {
    (req as any).log?.error({ err }, "Failed to initialize API router");
    logger.error({ err }, "Failed to initialize API router");
    res.status(500).json({
      error: "تعذر تشغيل خدمات الخادم",
      code: "API_ROUTER_INIT_FAILED",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

app.use("/api", (_req: Request, res: Response): void => {
  res.status(404).json({ error: "المسار غير موجود", code: "NOT_FOUND" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  (req as any).log?.error({ err }, "Unhandled route error");
  logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
  res.status(500).json({
    error: "حدث خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى.",
    code: "INTERNAL_ERROR",
  });
});

export default app;