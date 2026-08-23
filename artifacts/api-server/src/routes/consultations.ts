import { Router, type IRouter } from "express";
import { db, consultationsTable, consultationMessagesTable, consultationParamsHistoryTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateConsultationBody, GetConsultationParams } from "@workspace/api-zod";
import { checkAndReserveService, releaseService } from "../lib/quota";
import { triggerProactiveSearch, isProactiveSearchInProgress, hasProactiveCacheEntry } from "../lib/proactive-rag";

const router: IRouter = Router();
const SUPPORTED_COUNTRY_CODES = new Set(["SA", "AE", "KW", "QA", "BH", "OM"]);
const COUNTRY_NAMES: Record<string, string> = {
  SA: "المملكة العربية السعودية",
  AE: "الإمارات العربية المتحدة",
  KW: "الكويت",
  QA: "قطر",
  BH: "البحرين",
  OM: "سلطنة عُمان",
};

const CHATGPT_URL = "https://chatgpt.com/g/g-69ffbc442f9081919567bddf4735670a-rabab-legal-ai";

type MessageTimestamp = Date | string;

function formatTimestamp(timestamp: MessageTimestamp): string {
  return timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
}

function formatConsultation(
  c: typeof consultationsTable.$inferSelect,
  lastMsg?: { content: string; role: string; createdAt: MessageTimestamp } | null,
) {
  const snippet = lastMsg
    ? lastMsg.content.replace(/\s+/g, " ").trim().slice(0, 100)
    : null;
  return {
    id: c.id,
    userId: c.userId,
    subscriptionId: c.subscriptionId,
    title: c.title,
    areaAr: c.areaAr,
    status: c.status,
    chatgptUrl: c.chatgptUrl,
    taskType: c.taskType ?? null,
    taskParams: (c.taskParams as Record<string, string> | null) ?? null,
    createdAt: c.createdAt,
    lastMessageAt: lastMsg ? formatTimestamp(lastMsg.createdAt) : null,
    lastMessageSnippet: snippet,
    lastMessageRole: lastMsg ? lastMsg.role : null,
  };
}

// GET /api/consultations — list all consultations for the current user
router.get("/consultations", requireAuth, async (req, res): Promise<void> => {
  const consultations = await db.select().from(consultationsTable)
    .where(eq(consultationsTable.userId, req.userId!));

  // Fetch last non-system message per consultation in one query (DISTINCT ON)
  const lastMsgMap = new Map<number, { content: string; role: string; createdAt: MessageTimestamp }>();
  if (consultations.length > 0) {
    const ids = consultations.map(c => c.id);
    // استخدام IN مع sql.raw آمن هنا لأن القيم صحيحة (integer) مصدرها استعلام DB
    const idsStr = sql.raw(ids.join(','));
    const rows = await db.execute(
      sql`SELECT DISTINCT ON (consultation_id) consultation_id, content, role, created_at
          FROM consultation_messages
          WHERE consultation_id IN (${idsStr})
            AND role != 'system'
          ORDER BY consultation_id, created_at DESC`
    );
    for (const row of rows.rows as Array<{ consultation_id: number; content: string; role: string; created_at: MessageTimestamp }>) {
      lastMsgMap.set(row.consultation_id, {
        content: row.content,
        role: row.role,
        createdAt: row.created_at,
      });
    }
  }

  res.json(consultations.map(c => formatConsultation(c, lastMsgMap.get(c.id))));
});

// POST /api/consultations — create a new consultation
router.post("/consultations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConsultationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let taskParams = req.body?.taskParams;
  if (
    parsed.data.taskType === "consultation" &&
    !SUPPORTED_COUNTRY_CODES.has(taskParams?.countryCode)
  ) {
    res.status(400).json({ error: "اختر دولة الاستشارة من الخيارات المتاحة قبل البدء." });
    return;
  }
  if (parsed.data.taskType === "consultation") {
    const countryCode = taskParams.countryCode as string;
    // لا نعتمد اسم الدولة القادم من المتصفح؛ نثبته من الرمز المعتمد نفسه.
    taskParams = {
      ...taskParams,
      countryCode,
      country: COUNTRY_NAMES[countryCode],
    };
  }

  // Admins bypass quota checks
  let subId: number | undefined;
  let reservedSessionId: number | undefined;

  if (req.userRole !== "admin") {
    const clientSession = req.body?.clientSession as string | undefined;
    const result = await checkAndReserveService(req.userId!, "consultation", clientSession);
    if (!result.ok) {
      res.status(403).json({
        error: result.message ?? "لا توجد صلاحية لفتح استشارة جديدة",
        code: result.needsUpgrade ? "TRIAL_EXHAUSTED" : "QUOTA_EXHAUSTED",
        needsUpgrade: result.needsUpgrade,
      });
      return;
    }
    reservedSessionId = result.sessionId;
    // Use the subscription actually reserved by the quota engine. For an
    // organization member this is the owner's shared business subscription.
    subId = result.subscriptionId;
  }

  if (reservedSessionId) {
    const [existing] = await db.select().from(consultationsTable)
      .where(eq(consultationsTable.serviceSessionId, reservedSessionId))
      .limit(1);
    if (existing) {
      res.status(200).json({ ...formatConsultation(existing), _sessionId: reservedSessionId });
      return;
    }
  }

  let consultation: typeof consultationsTable.$inferSelect;
  try {
    [consultation] = await db.insert(consultationsTable).values({
      userId: req.userId!,
      subscriptionId: subId,
      serviceSessionId: reservedSessionId ?? null,
      title: parsed.data.title,
      areaAr: parsed.data.areaAr,
      taskType: parsed.data.taskType,
      taskParams: taskParams ?? null,
      chatgptUrl: CHATGPT_URL,
    }).returning();
  } catch (error) {
    if (reservedSessionId) {
      const [existing] = await db.select().from(consultationsTable)
        .where(eq(consultationsTable.serviceSessionId, reservedSessionId))
        .limit(1);
      if (existing) {
        res.status(200).json({ ...formatConsultation(existing), _sessionId: reservedSessionId });
        return;
      }
      await releaseService(reservedSessionId).catch(() => {});
    }
    throw error;
  }

  // The service session is committed (counted) in chat.ts after the first
  // successful OpenAI reply — so the user is only charged when they get an answer.

  // ── Proactive KB search (fire-and-forget) ────────────────────────────────
  // For specialized task types, pre-fetch relevant KB chunks so the first AI
  // reply is already enriched. Runs in the background — does not block response.
  if (parsed.data.taskType) {
    const rawKey = process.env.OPENAI_API_KEY ?? "";
    const apiKey = rawKey.replace(/[^\x20-\x7E]/g, "").trim();
    if (apiKey) {
      const resolvedParams =
        (consultation.taskParams as Record<string, string> | null) ?? {};
      triggerProactiveSearch(
        consultation.id,
        parsed.data.taskType,
        resolvedParams,
        apiKey,
      ).catch(() => {}); // truly fire-and-forget
    }
  }

  res.status(201).json({ ...formatConsultation(consultation), _sessionId: reservedSessionId });
});

// GET /api/consultations/:id — get a single consultation
router.get("/consultations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetConsultationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [c] = await db.select().from(consultationsTable)
    .where(and(eq(consultationsTable.id, params.data.id), eq(consultationsTable.userId, req.userId!)));
  if (!c) {
    res.status(404).json({ error: "الاستشارة غير موجودة" });
    return;
  }
  res.json(formatConsultation(c));
});

/**
 * GET /api/consultations/:id/proactive-status
 * Returns { ready: true } once the background KB pre-fetch has completed
 * (or was never triggered).  Returns { ready: false } while it is still running.
 * Clients poll this at ~1.5 s intervals and hide the "جارٍ تحضير المصادر" banner
 * as soon as ready flips to true.
 */
router.get("/consultations/:id/proactive-status", requireAuth, async (req, res): Promise<void> => {
  const params = GetConsultationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Ownership check — only the owning user may poll
  const [c] = await db.select({ id: consultationsTable.id })
    .from(consultationsTable)
    .where(and(eq(consultationsTable.id, params.data.id), eq(consultationsTable.userId, req.userId!)));
  if (!c) {
    res.status(404).json({ error: "الاستشارة غير موجودة" });
    return;
  }
  const inProgress = isProactiveSearchInProgress(params.data.id);
  res.json({
    ready: !inProgress,
    // hasCachedResult distinguishes a successful pre-fetch (true) from a
    // search that finished with an error / was never triggered (false).
    hasCachedResult: !inProgress && hasProactiveCacheEntry(params.data.id),
  });
});

// PATCH /api/consultations/:id — update taskParams with audit trail
router.patch("/consultations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetConsultationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { taskParams } = req.body as { taskParams?: unknown };
  if (!taskParams || typeof taskParams !== "object" || Array.isArray(taskParams)) {
    res.status(400).json({ error: "taskParams مطلوب ويجب أن يكون كائناً" });
    return;
  }

  // Ensure the consultation belongs to the current user
  const [existing] = await db.select().from(consultationsTable)
    .where(and(eq(consultationsTable.id, params.data.id), eq(consultationsTable.userId, req.userId!)));
  if (!existing) {
    res.status(404).json({ error: "الاستشارة غير موجودة" });
    return;
  }

  // Sanitise: keep only string values
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(taskParams as Record<string, unknown>)) {
    if (typeof v === "string") cleaned[k] = v;
  }

  // Wrap update + audit insert in a single transaction so both succeed or both roll back
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(consultationsTable)
      .set({ taskParams: cleaned })
      .where(eq(consultationsTable.id, params.data.id))
      .returning();

    await tx.insert(consultationParamsHistoryTable).values({
      consultationId: existing.id,
      oldParams: (existing.taskParams as Record<string, string> | null) ?? null,
      newParams: cleaned,
      updatedBy: req.userId!,
    });

    return row;
  });

  res.json(formatConsultation(updated));
});

export default router;
