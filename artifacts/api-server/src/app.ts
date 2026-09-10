import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { isTrustedFrontendOrigin } from "./lib/origin-policy";
import { requireAdmin } from "./middlewares/auth";
import {
  getOwnerTestMode,
  isAdminOnlyTestingEnabled,
  isOwnerTestingPublicPath,
} from "./lib/owner-test-access";
import { ensureCriticalSchema } from "./lib/critical-schema";

const PgStore = connectPgSimple(session);

const app: Express = express();

app.disable("x-powered-by");
app.use((_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  next();
});

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

function isAllowedOrigin(origin: string): boolean {
  if (
    process.env.NODE_ENV !== "production" &&
    [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ].includes(origin)
  ) {
    return true;
  }
  return isTrustedFrontendOrigin(origin, process.env.CORS_ALLOWED_ORIGINS);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
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
const rateLimitCleanup = setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of rateLimitBuckets) {
      if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
    }
  },
  5 * 60 * 1000,
);
rateLimitCleanup.unref();

app.use("/api", (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === "/health" || req.path === "/healthz") {
    next();
    return;
  }

  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const current = rateLimitBuckets.get(key);
  const bucket =
    !current || current.resetAt <= now
      ? { count: 1, resetAt: now + rateLimitWindowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
  rateLimitBuckets.set(key, bucket);

  res.setHeader("RateLimit-Limit", rateLimitMaxRequests);
  res.setHeader(
    "RateLimit-Remaining",
    Math.max(0, rateLimitMaxRequests - bucket.count),
  );
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
const isReplitOrProd =
  !!process.env.REPL_ID || process.env.NODE_ENV === "production";

app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true, // يُنشئ الجدول تلقائياً إن لم يكن موجوداً
      pruneSessionInterval: 60 * 60,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isReplitOrProd, // require HTTPS when behind proxy
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

  const requestOrigin =
    req.headers.origin ??
    (() => {
      try {
        return req.headers.referer
          ? new URL(req.headers.referer).origin
          : undefined;
      } catch {
        return undefined;
      }
    })();

  if (requestOrigin && isAllowedOrigin(requestOrigin)) {
    next();
    return;
  }

  logger.warn(
    { origin: requestOrigin, path: req.path },
    "Rejected cookie-authenticated cross-site request",
  );
  res.status(403).json({ error: "طلب غير مصرح", code: "CSRF_REJECTED" });
});

// During a closed test, production traffic remains online for the owner without
// permitting visitors to register, consume services, or access platform data.
// The mode is disabled unless OWNER_TEST_MODE is explicitly set to admin_only.
app.use(
  "/api",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isAdminOnlyTestingEnabled() || isOwnerTestingPublicPath(req.path)) {
      next();
      return;
    }
    await requireAdmin(req, res, next);
  },
);

// Keep production databases created before the latest consultation fields
// compatible with the current API. This runs after authentication/test-mode
// gates so rejected traffic never causes a database migration attempt.
app.use(
  "/api",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (
      !req.path.startsWith("/consultations") &&
      !req.path.startsWith("/contract")
    ) {
      next();
      return;
    }
    try {
      await ensureCriticalSchema();
      next();
    } catch (error) {
      req.log?.error({ err: error }, "Critical database schema is not ready");
      res.status(503).json({
        error: "الخدمة قيد التهيئة. يرجى إعادة المحاولة بعد لحظات.",
        code: "DATABASE_SCHEMA_NOT_READY",
      });
    }
  },
);

router.get("/access-mode", (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ mode: getOwnerTestMode() });
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
app.use(
  (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    (req as any).log?.error({ err }, "Unhandled route error");
    logger.error(
      { err, url: req.url, method: req.method },
      "Unhandled route error",
    );
    res.status(500).json({
      error: "حدث خطأ داخلي في الخادم. يرجى المحاولة مرة أخرى.",
      code: "INTERNAL_ERROR",
    });
  },
);

export default app;
