/**
 * WhatsApp gated sender — wraps sendWhatsApp with:
 *   1. Admin toggle check (platform_settings key: whatsapp_config.enabled)
 *   2. Always-log to whatsapp_log table (for audit + replay when enabled)
 */
import { db, platformSettingsTable, whatsappLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendWhatsApp } from "./whatsapp";
import { logger } from "./logger";

interface WhatsappConfig {
  enabled: boolean;
  allowedNumbers?: string[];
}

async function getWhatsappConfig(): Promise<WhatsappConfig> {
  try {
    const [row] = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "whatsapp_config"));
    if (row?.value) return row.value as WhatsappConfig;
  } catch {
    // fallback
  }
  return { enabled: false };
}

export async function sendWhatsAppGated(
  to: string,
  body: string,
  userId?: number
): Promise<boolean> {
  const cfg = await getWhatsappConfig();
  const adminDisabled = !cfg.enabled;
  const preview = body.slice(0, 200);

  let sent = false;
  let failReason: string | undefined;

  if (!adminDisabled) {
    try {
      sent = await sendWhatsApp(to, body);
      if (!sent) failReason = "Twilio error or missing config";
    } catch (err: any) {
      failReason = err?.message ?? "exception";
    }
  } else {
    failReason = "admin_disabled";
    logger.info({ to, userId }, "📱 واتساب: مُعطَّل بواسطة المدير — الرسالة مسجَّلة فقط");
  }

  // Always log
  try {
    await db.insert(whatsappLogTable).values({
      userId: userId ?? null,
      toNumber: to,
      messagePreview: preview,
      sent,
      adminDisabled,
      failReason: failReason ?? null,
    });
  } catch (logErr) {
    logger.error({ logErr }, "📱 واتساب: فشل تسجيل الرسالة");
  }

  return sent;
}
