import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const PgStore = connectPgSimple(session);

const app: Express = express();

// ── Trust Replit's HTTPS reverse-proxy so session cookies and IP detection ──
// work correctly. Without this, Express sees every request as HTTP even though
// the browser is on HTTPS, and sameSite/secure cookie logic breaks.
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
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

// ── Cookie security: always use sameSite='none' + secure=true inside Replit ──
// Replit serves the app over HTTPS through a reverse proxy even in development.
// sameSite='lax' blocks cookies in cross-origin sub-requests (e.g. the iframe
// preview), which silently breaks auth. REPL_ID is set in all Replit envs.
const isReplitOrProd = !!process.env.REPL_ID || process.env.NODE_ENV === "production";

app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,     // يُنشئ الجدول تلقائياً إن لم يكن موجوداً
      pruneSessionInterval: 60 * 60,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isReplitOrProd,          // require HTTPS when behind proxy
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: isReplitOrProd ? "none" : "lax",
    },
  }),
);

app.use("/api", router);

// ── 404 handler for unmatched /api/* routes ────────────────────────────────
// Must come AFTER router registration so it only fires when no route matched.
app.use("/api", (_req: Request, res: Response): void => {
  res.status(404).json({ error: "المسار غير موجود", code: "NOT_FOUND" });
});

// ── Global JSON error handler ──────────────────────────────────────────────
// Catches any unhandled error thrown in route handlers and returns a safe
// JSON response instead of Express's default HTML error page.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  (req as any).log?.error({ err }, "Unhandled route error");
  logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
  res.status(500).json({
    error: "حدث خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى.",
    code: "INTERNAL_ERROR",
  });
});

export default app;
