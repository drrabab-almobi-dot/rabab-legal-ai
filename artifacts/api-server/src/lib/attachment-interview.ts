export const ATTACHMENT_CONTEXT_START = "[محتوى مرفق للتحليل]";
export const ATTACHMENT_CONTEXT_END = "[/محتوى مرفق للتحليل]";

const INTERVIEW_MARKER_PREFIX = "[[RABAB_ATTACHMENT_INTAKE:";
const INTERVIEW_MARKER_SUFFIX = "]]";

export type AttachmentInterviewState =
  "none" | "collecting" | "ready" | "completed";

export interface AttachmentInterviewProgress {
  state: AttachmentInterviewState;
  factSummary: string | null;
}

interface ConversationMessage {
  role: string;
  content: string;
}

/**
 * Extracted file text is transmitted inside a clearly delimited segment. A file
 * name alone is not enough to enter the intake flow: old clients can still send
 * one without an extracted document.
 */
export function hasAttachmentContext(message: string): boolean {
  const start = message.indexOf(ATTACHMENT_CONTEXT_START);
  const end = message.indexOf(ATTACHMENT_CONTEXT_END);
  return start >= 0 && end > start;
}

/** Returns the most recent hidden attachment-interview state for a consultation. */
export function getAttachmentInterviewProgress(
  messages: ConversationMessage[],
): AttachmentInterviewProgress {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "system") continue;
    if (!message.content.startsWith(INTERVIEW_MARKER_PREFIX)) continue;

    const markerEnd = message.content.indexOf(INTERVIEW_MARKER_SUFFIX);
    if (markerEnd < 0) continue;
    const state = message.content
      .slice(INTERVIEW_MARKER_PREFIX.length, markerEnd)
      .trim();

    if (state === "collecting" || state === "ready" || state === "completed") {
      const factSummary = message.content
        .slice(markerEnd + INTERVIEW_MARKER_SUFFIX.length)
        .trim();
      return { state, factSummary: factSummary || null };
    }
  }

  return { state: "none", factSummary: null };
}

/** Stores workflow state in a system message, which is never returned to clients. */
export function attachmentInterviewMarker(
  state: Exclude<AttachmentInterviewState, "none">,
  factSummary?: string,
): string {
  return `${INTERVIEW_MARKER_PREFIX}${state}${INTERVIEW_MARKER_SUFFIX}${
    factSummary?.trim() ? `\n${factSummary.trim().slice(0, 4_000)}` : ""
  }`;
}

/**
 * The model must select one of these directives. Missing or malformed output is
 * handled conservatively as an incomplete intake, never as permission to issue a
 * legal opinion without verified sources.
 */
export function parseAttachmentIntakeResponse(raw: string): {
  state: "collecting" | "ready";
  text: string;
} {
  const directive = raw.match(/\[\[RABAB_ATTACHMENT_INTAKE:(MORE|READY)\]\]/i);
  const state =
    directive?.[1]?.toUpperCase() === "READY" ? "ready" : "collecting";
  const text = raw
    .replace(/\[\[RABAB_ATTACHMENT_INTAKE:(?:MORE|READY)\]\]/gi, "")
    .trim();

  return { state, text };
}

export function attachmentFactIntakePrompt(
  isFirstAttachmentMessage: boolean,
): string {
  const phase = isFirstAttachmentMessage
    ? "هذه أول رسالة مرتبطة بمرفق مستخرج النص."
    : "هذه رسالة متابعة في مقابلة بدأت بمرفق.";

  return (
    `[مرحلة جمع الوقائع من المرفق — تعليمة إلزامية]\n${phase}\n\n` +
    "المطلوب الآن هو تحليل المحتوى المقدم لا إصدار رأي قانوني ولا البحث في الإنترنت. " +
    "استخرج بإيجاز الوقائع الظاهرة فعلاً في المستند أو الرسائل السابقة، وميّز ما لا يظهر فيها. " +
    "حدّد أهم معلومة واحدة فقط يؤثر غيابها في التكييف أو المدة أو الاختصاص أو الإثبات.\n\n" +
    "إذا بقيت معلومة جوهرية ناقصة: اكتب ملخصاً محايداً قصيراً للوقائع الثابتة ثم اسأل سؤالاً واحداً مباشراً فقط، " +
    "ولا تذكر مواد أو أنظمة أو نتيجة أو توصية. وفي آخر الرد أضف وحده: [[RABAB_ATTACHMENT_INTAKE:MORE]].\n\n" +
    "إذا اكتملت الوقائع الجوهرية اللازمة لبدء التحقق النظامي: لا تعطِ رأياً قانونياً. اكتب فقط ملخصاً محايداً للوقائع " +
    "المكتملة، ثم في آخر الرد أضف وحده: [[RABAB_ATTACHMENT_INTAKE:READY]]."
  );
}

export const SAFE_FALLBACK_ATTACHMENT_QUESTION =
  "تمت مراجعة المعلومات المتاحة من المرفق. ما النتيجة أو الإجراء الذي تطلبه تحديداً في هذه الاستشارة؟";

/**
 * Keeps the intake conversational: one missing fact per turn. If a model reply
 * omits a question or asks several, preserve the factual summary before the
 * first question and provide one deterministic, non-legal fallback question.
 */
export function formatAttachmentIntakeReply(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim().slice(0, 1_600);
  const firstQuestionIndex = compact.search(/[؟?]/);
  if (firstQuestionIndex >= 0) {
    return compact.slice(0, firstQuestionIndex + 1).trim();
  }

  const summary = compact || "تمت مراجعة المعلومات المتاحة من المرفق.";
  return `${summary}\n\n${SAFE_FALLBACK_ATTACHMENT_QUESTION}`;
}

/** Builds a concise, source-searchable query after the factual intake completes. */
export function buildAttachmentVerificationQuery(
  factSummary: string | null,
  currentMessage: string,
): string {
  return [factSummary, currentMessage]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n")
    .replace(/\s+/g, " ")
    .slice(0, 2_000)
    .trim();
}
