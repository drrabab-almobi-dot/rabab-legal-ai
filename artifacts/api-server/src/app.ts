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

const allowedOrigins = new Set(
  [
    "https://rabablegal.com",
    "https://www.rabablegal.com",
    "https://rabab-legal.vercel.app",
    "https://rabab-legal-ai.vercel.app",
    ...(process.env.CORS_ALLOWED_ORIGINS ?? "").split(","),
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"]),
  ]
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      logger.warn({ origin }, "CORS request from disallowed origin");
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const rateLimitWindowMs = 15 * 60 * 1000;
const rateLimitMaxRequests = 300;
const rateLimitCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 5 * 60 * 1000);
rateLimitCleanup.unref();

app.use("/api", (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === "/health" || req.path === "/healthz") {
    next();
    return;
  }

  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const current = rateLimitBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + rateLimitWindowMs }
    : { count: current.count + 1, resetAt: current.resetAt };
  rateLimitBuckets.set(key, bucket);

  res.setHeader("RateLimit-Limit", rateLimitMaxRequests);
  res.setHeader("RateLimit-Remaining", Math.max(0, rateLimitMaxRequests - bucket.count));
  res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > rateLimitMaxRequests) {
    res.status(429).json({
      error: "تجاوزت الحد المسموح من الطلبات. يرجى المحاولة لاحقاً.",
      code: "RATE_LIMIT_EXCEEDED",
    });
    return;
  }

  next();
});

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

// Cookie-authenticated state changes must originate from an explicitly trusted
// frontend. Bearer-token and cookie-free server-to-server calls are not
// susceptible to browser CSRF and remain supported.
app.use("/api", (req: Request, res: Response, next: NextFunction): void => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  if (req.headers.authorization?.startsWith("Bearer ") || !req.headers.cookie) {
    next();
    return;
  }

  const requestOrigin = req.headers.origin ?? (() => {
    try {
      return req.headers.referer ? new URL(req.headers.referer).origin : undefined;
    } catch {
      return undefined;
    }
  })();

  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    next();
    return;
  }

  logger.warn({ origin: requestOrigin, path: req.path }, "Rejected cookie-authenticated cross-site request");
  res.status(403).json({ error: "طلب غير مصرح", code: "CSRF_REJECTED" });
});

app.use("/api", router);

// ── 404 handler for unmatched /api/* routes ────────────────────────────────
// Must come AFTER router registration so it only fires when no route matched.
app.use("/api", (_req: Request, res: Response): void => {
  res.status(404).json({ error: "المسار غير موجود", code: "NOT_FOUND" });
});

// ── Global JSON error handler ──────────────────────────────────────────────
// Catches any unhandled error thrown in route handlers and returns a safe
// JSON response instead of Express's default HTML error page.
app.use((err: Error, req: Request, res: Response, _next: NextFunction): void => {
  (req as any).log?.error({ err }, "Unhandled route error");
  logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
  res.status(500).json({
    error: "حدث خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى.",
    code: "INTERNAL_ERROR",
  });
});

export default app;
