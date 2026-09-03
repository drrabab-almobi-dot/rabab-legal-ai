import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const PgStore = connectPgSimple(session);

const app: Express = express();
let appReady = false;

export function markAppReady(): void {
  appReady = true;
}

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

// ── CORS: restrict to known origins ─────────────────────────────────────────
const ALLOWED_ORIGINS: string[] = [
  "https://rabablegal.com",
  "https://www.rabablegal.com",
  "https://rabab-legal-ai.vercel.app",
];

// In development, also allow common localhost ports
if (process.env.NODE_ENV !== "production") {
  ALLOWED_ORIGINS.push(
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn({ origin }, "CORS request from disallowed origin");
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Global rate limiter (in-memory, per-IP) ─────────────────────────────────
// Limits each IP to a fixed number of requests per window to mitigate abuse.
// For multi-instance deployments, replace with a Redis-backed limiter.
interface RateLimitBucket { count: number; resetAt: number; }
const rateLimitMap = new Map<string, RateLimitBucket>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 300;          // max requests per window per IP

// Periodic cleanup to prevent memory leaks (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitMap) {
    if (now > bucket.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

app.use("/api", (req: Request, res: Response, next: NextFunction): void => {
  // Skip rate limiting for health checks
  if (req.path === "/healthz") { next(); return; }

  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  let bucket = rateLimitMap.get(ip);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, bucket);
  } else {
    bucket.count++;
  }

  // Set standard rate-limit headers
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, RATE_LIMIT_MAX_REQUESTS - bucket.count));
  res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    logger.warn({ ip, count: bucket.count }, "Rate limit exceeded");
    res.status(429).json({
      error: "تجاوزت الحد المسموح من الطلبات. يرجى المحاولة لاحقاً.",
      code: "RATE_LIMIT_EXCEEDED",
    });
    return;
  }
  next();
});

// ── CSRF protection via Origin/Referer validation ───────────────────────────
// For state-changing requests (POST/PUT/PATCH/DELETE) using session cookies,
// verify that the Origin or Referer header matches an allowed origin.
// Bearer-token-only requests (no session cookie) are exempt since CSRF
// cannot forge Authorization headers.
app.use("/api", (req: Request, res: Response, next: NextFunction): void => {
  // Only check mutating methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }

  // If request carries a Bearer token, CSRF is not a concern
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) { next(); return; }

  // Check Origin or Referer
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin)) { next(); return; }
    logger.warn({ origin, path: req.path }, "CSRF: disallowed origin on mutating request");
    res.status(403).json({ error: "طلب غير مصرح", code: "CSRF_REJECTED" });
    return;
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (ALLOWED_ORIGINS.includes(refOrigin)) { next(); return; }
    } catch { /* malformed referer */ }
    logger.warn({ referer, path: req.path }, "CSRF: disallowed referer on mutating request");
    res.status(403).json({ error: "طلب غير مصرح", code: "CSRF_REJECTED" });
    return;
  }

  // No Origin or Referer: allow in development, block in production
  if (process.env.NODE_ENV === "production") {
    logger.warn({ path: req.path, ip: req.ip }, "CSRF: missing Origin/Referer in production");
    res.status(403).json({ error: "طلب غير مصرح", code: "CSRF_REJECTED" });
    return;
  }

  next();
});

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.error("FATAL: SESSION_SECRET environment variable is required. Set it in Render environment variables.");
  process.exit(1);
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

// Render must be able to see that the process is alive while database
// migrations/checks are still running. All real API traffic remains gated
// until those checks complete, so requests cannot use a half-initialized app.
app.use("/api", (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === "/healthz" || appReady) {
    next();
    return;
  }
  res.status(503).json({
    error: "الخادم قيد التجهيز. يرجى المحاولة بعد لحظات.",
    code: "SERVICE_STARTING",
  });
});

app.use("/api", router);

// ── 404 handler for unmatched /api/* routes ────────────────────────────────
// Must come AFTER router registration so it only fires when no route matched.
app.use("/api", (_req: Request, res: Response): void => {
  res.status(404).json({ error: "المسار غير موجود", code: "NOT_FOUND" });
});

// ── Global JSON error handler ───────────────────────────────────────────────
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
