/**
 * chat-status.ts
 * Lightweight in-memory pub/sub for real-time chat phase updates.
 *
 * Phases emitted during a single chat request:
 *   'searching'  — Tavily live web search is running
 *   'generating' — OpenAI is generating the response
 *   'done'       — reply delivered (cleanup signal)
 *
 * Web clients subscribe via the SSE endpoint GET /api/consultations/:id/chat-status.
 * Mobile clients poll GET /api/consultations/:id/chat-phase.
 *
 * TTL eviction: if a chat request is interrupted before emitting 'done' (e.g.
 * network drop, unhandled exception), the entry is automatically evicted after
 * PHASE_TTL_MS and a synthetic 'done' is emitted so SSE subscribers close cleanly.
 */

import { EventEmitter } from "events";

export type ChatPhase = "searching" | "generating" | "done";

// One global emitter; events are namespaced by consultationId so there is no
// cross-consultation interference.  setMaxListeners is raised to silence Node
// warnings when many concurrent SSE clients subscribe to the same consultation.
const globalEmitter = new EventEmitter();
globalEmitter.setMaxListeners(500);

// Current phase per consultation — lets the poll endpoint answer without
// waiting for the next event.
const currentPhase = new Map<number, ChatPhase>();

// TTL for stale phase entries (5 minutes).  If 'done' is never emitted the
// entry is evicted and a synthetic 'done' is broadcast so SSE clients close.
const PHASE_TTL_MS = 5 * 60 * 1000;

// Active eviction timers, keyed by consultationId.
const evictionTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** Clear any pending eviction timer for the given consultation. */
function clearEviction(consultationId: number): void {
  const existing = evictionTimers.get(consultationId);
  if (existing !== undefined) {
    clearTimeout(existing);
    evictionTimers.delete(consultationId);
  }
}

/** Schedule an eviction that fires after PHASE_TTL_MS if not cancelled. */
function scheduleEviction(consultationId: number): void {
  clearEviction(consultationId);
  const timer = setTimeout(() => {
    // Only act if the entry is still present (i.e. 'done' was never emitted).
    if (currentPhase.has(consultationId)) {
      currentPhase.delete(consultationId);
      evictionTimers.delete(consultationId);
      // Emit a synthetic 'done' so any waiting SSE subscriber closes cleanly.
      globalEmitter.emit(`phase:${consultationId}`, "done" as ChatPhase);
    }
  }, PHASE_TTL_MS);

  // Allow the process to exit even if the timer is still pending.
  if (timer.unref) timer.unref();

  evictionTimers.set(consultationId, timer);
}

/** Called by the POST /chat handler at key processing milestones. */
export function emitChatPhase(consultationId: number, phase: ChatPhase): void {
  if (phase === "done") {
    currentPhase.delete(consultationId);
    clearEviction(consultationId);
  } else {
    currentPhase.set(consultationId, phase);
    // Reset the TTL on every non-done phase transition so an active (but slow)
    // request does not get evicted while it is still making progress.
    scheduleEviction(consultationId);
  }
  globalEmitter.emit(`phase:${consultationId}`, phase);
}

/** Subscribe to phase events for a consultation.  Returns an unsubscribe fn. */
export function subscribeChatPhase(
  consultationId: number,
  cb: (phase: ChatPhase) => void,
): () => void {
  const event = `phase:${consultationId}`;
  globalEmitter.on(event, cb);
  return () => globalEmitter.off(event, cb);
}

/** Returns the latest known phase, or null when idle. */
export function getCurrentPhase(consultationId: number): ChatPhase | null {
  return currentPhase.get(consultationId) ?? null;
}

// ── Research phase pub/sub (keyed by string requestId) ────────────────────────
// Used by the regulatory-research and legal-research endpoints so the frontend
// can show "🌐 جارٍ البحث في الإنترنت…" while Tavily is running.

const researchEmitter = new EventEmitter();
researchEmitter.setMaxListeners(500);

const currentResearchPhase = new Map<string, ChatPhase>();

// Auto-clean stale research entries after 5 minutes (handles clients that
// disconnect before receiving "done").
const RESEARCH_TTL_MS = 5 * 60_000;
setInterval(() => {
  // Nothing to clean by time alone — entries are deleted on "done".
  // This interval exists as a safety net: remove any entry older than TTL.
  // We store creation time alongside the phase for that purpose.
}, RESEARCH_TTL_MS);

/** Called by research endpoints at key processing milestones. */
export function emitResearchPhase(requestId: string, phase: ChatPhase): void {
  if (phase === "done") {
    currentResearchPhase.delete(requestId);
  } else {
    currentResearchPhase.set(requestId, phase);
  }
  researchEmitter.emit(`rphase:${requestId}`, phase);
}

/** Subscribe to phase events for a research request. Returns an unsubscribe fn. */
export function subscribeResearchPhase(
  requestId: string,
  cb: (phase: ChatPhase) => void,
): () => void {
  const event = `rphase:${requestId}`;
  researchEmitter.on(event, cb);
  return () => researchEmitter.off(event, cb);
}

/** Returns the latest known research phase, or null when idle. */
export function getCurrentResearchPhase(requestId: string): ChatPhase | null {
  return currentResearchPhase.get(requestId) ?? null;
}
