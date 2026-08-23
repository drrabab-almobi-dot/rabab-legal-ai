/**
 * topic-router.ts — توجيه موضوع المستخدم إلى الخدمة القانونية المناسبة
 *
 * يستخدم gpt-4o-mini بلا ميثاق التشغيل ولا ملاحق الخدمات لتقليل الكلفة.
 * لا يستهلك رصيداً ولا يتطلب اشتراكاً.
 */

import { Router } from "express";
import OpenAI from "openai";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SERVICES = [
  { id: "consultation",  label: "استشارة قانونية عامة",        branches: [] },
  { id: "judicial",      label: "استشارة قضائية",               branches: ["مذكرة دفاع", "مذكرة اعتراض", "جلسة استماع", "طعن", "تنفيذ"] },
  { id: "pleadings",     label: "تحرير مذكرات قانونية",         branches: ["مذكرة دفاع", "مذكرة اعتراض", "مذكرة ابتدائية", "مذكرة استئناف", "مذكرة طعن"] },
  { id: "contracts",     label: "صياغة ومراجعة العقود",         branches: ["صياغة عقد", "مراجعة عقد", "تحليل عقد", "استخراج بنود"] },
  { id: "research",      label: "الباحثة الذكية القانونية",     branches: ["بحث تشريعي", "بحث قضائي", "بحث تنظيمي"] },
] as const;

const FIELDS_BY_SERVICE: Record<string, string[]> = {
  consultation:  ["الموضوع", "الدولة والولاية القضائية", "صفة المستفيد", "التواريخ المؤثرة", "وجود مستندات"],
  judicial:      ["نوع المذكرة", "المسار القضائي", "صفة الموكل", "الخصم", "الوقائع", "المستندات", "تاريخ التبليغ"],
  pleadings:     ["نوع المذكرة", "المسار القضائي", "صفة الموكل", "الخصم", "الوقائع", "المستندات", "تاريخ التبليغ"],
  contracts:     ["نوع العقد", "الأطراف وصفاتهم", "محل العقد", "القيمة", "المدة", "الولاية القضائية"],
  research:      ["موضوع البحث", "الفرع القانوني"],
};

// ── POST /api/topic/route ─────────────────────────────────────────────────────
router.post("/topic/route", requireAuth, async (req, res): Promise<void> => {
  const rawDesc = req.body?.description;
  if (typeof rawDesc !== "string" || rawDesc.trim().length < 10 || rawDesc.length > 2000) {
    res.status(400).json({ error: "الوصف قصير جداً أو غير صالح (10-2000 حرف)" });
    return;
  }
  const description = rawDesc.trim();

  const systemPrompt = `أنت مساعد توجيه قانوني. مهمتك تحديد الخدمة القانونية الأنسب لوصف المستخدم، وإعادة صياغة الموضوع بلغة قانونية موجزة، واستخراج المعطيات المتاحة.

الخدمات المتاحة:
${SERVICES.map(s => `- ${s.id}: ${s.label}`).join("\n")}

أجب بـ JSON صارم بهذا الشكل:
{
  "service": "<service_id>",
  "branch": "<branch_or_null>",
  "understanding": "<إعادة صياغة موجزة بلغة قانونية — جملة أو جملتان>",
  "confidence": "high|medium|low",
  "alternatives": [{"service": "<id>", "branch": "<branch_or_null>", "label": "<الخدمة>"}],
  "extractedFields": {"<field_name>": "<value>"}
}

قواعد:
- alternatives: فقط عند confidence=low أو medium — اذكر أقرب خيارَين
- extractedFields: استخرج فقط ما ذُكر صراحةً في الوصف — لا تخمّن
- الحقول المتاحة لكل خدمة: ${JSON.stringify(FIELDS_BY_SERVICE)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: description },
      ],
      temperature: 0,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      result = { service: "consultation", confidence: "low", understanding: description, alternatives: [], extractedFields: {} };
    }

    // تأكد من أن الخدمة صالحة
    const validService = SERVICES.find(s => s.id === result.service);
    if (!validService) result.service = "consultation";

    res.json({
      service:         result.service,
      branch:          result.branch ?? null,
      understanding:   result.understanding ?? description,
      confidence:      result.confidence ?? "medium",
      alternatives:    result.alternatives ?? [],
      extractedFields: result.extractedFields ?? {},
    });
  } catch (err) {
    logger.error({ err }, "[topic-router] Error routing topic");
    res.status(500).json({ error: "تعذّر التحليل — حاول مجدداً" });
  }
});

export { router as topicRouterRouter };
