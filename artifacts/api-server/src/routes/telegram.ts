import { Router, type IRouter, type Request, type Response } from "express";
// [DISABLED Aug-2026] import { getTelegramBotStatus } from "../lib/telegram-bot";
// البوت معطَّل — route محفوظ يُعيد حالة "disabled" ثابتة حتى يُقرر الإحياء.

const router: IRouter = Router();

/**
 * GET /api/telegram/health
 * [DISABLED Aug-2026] البوت معطَّل — يُعيد حالة disabled ثابتة.
 */
router.get("/telegram/health", (_req: Request, res: Response): void => {
  res.status(503).json({
    status: "disabled",
    bot: null,
    enabled: false,
    adminConfigured: false,
    reason: "Telegram bot disabled Aug-2026. Code preserved in telegram-bot.ts for future revival.",
  });
});

export default router;
