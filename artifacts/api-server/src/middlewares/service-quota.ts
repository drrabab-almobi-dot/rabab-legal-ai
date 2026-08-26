import type { NextFunction, Request, Response } from "express";
import { checkAndReserveService, commitService, releaseService, type ServiceType } from "../lib/quota";

function hasMeaningfulInput(req: Request): boolean {
  const candidates = [
    req.body?.q,
    req.body?.query,
    req.body?.question,
    req.body?.topic,
    req.query?.q,
    req.query?.query,
    req.query?.question,
    req.query?.topic,
  ];
  return candidates.some(value => typeof value === "string" && value.trim().length >= 2);
}

/**
 * Quota guard for authenticated AI/search endpoints.
 * Must run after requireAuth so req.userId / req.userRole are available.
 * Admins are exempt. Invalid/empty search requests are left to route validation
 * and do not reserve quota. A reservation is committed only after a successful
 * HTTP response; failures and aborted requests release the reservation.
 */
export function requireServiceQuota(serviceType: ServiceType = "consultation") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.userRole === "admin" || !hasMeaningfulInput(req)) {
      next();
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    try {
      const reservation = await checkAndReserveService(userId, serviceType);
      if (!reservation.ok || !reservation.sessionId) {
        res.status(429).json({
          error: reservation.message ?? "نفدت الحصة المتاحة لهذه الخدمة",
          code: reservation.needsUpgrade ? "UPGRADE_REQUIRED" : "QUOTA_EXHAUSTED",
        });
        return;
      }

      const sessionId = reservation.sessionId;
      let settled = false;

      const settle = async (success: boolean) => {
        if (settled) return;
        settled = true;
        try {
          if (success) await commitService(sessionId);
          else await releaseService(sessionId);
        } catch (err) {
          req.log?.error?.({ err, sessionId, serviceType }, "Failed to settle service quota reservation");
        }
      };

      res.once("finish", () => {
        void settle(res.statusCode >= 200 && res.statusCode < 400);
      });
      res.once("close", () => {
        if (!res.writableEnded) void settle(false);
      });

      next();
    } catch (err) {
      req.log?.error?.({ err, serviceType }, "Service quota guard failed");
      res.status(503).json({ error: "تعذر التحقق من الحصة حالياً — يرجى المحاولة بعد قليل", code: "QUOTA_CHECK_FAILED" });
    }
  };
}

export const requireConsultationQuota = requireServiceQuota("consultation");
