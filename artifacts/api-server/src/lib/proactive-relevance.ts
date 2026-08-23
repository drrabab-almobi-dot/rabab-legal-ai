import type { TavilyResult } from "./verification";

const ARABIC_STOP_WORDS = new Set([
  "على", "من", "في", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي",
  "كان", "كانت", "يكون", "وفي", "وعن", "وعلى", "وإلى", "وهو", "وهي", "لكن",
  "لأن", "حيث", "وقد", "وكان", "لقد", "بعد", "قبل", "خلال", "حول", "بين",
  "شكرا", "شكراً", "مرحبا", "مرحباً",
]);

export const PROACTIVE_RELEVANCE_THRESHOLD = 0.4;

type RelevanceSource = Pick<TavilyResult, "title" | "content">;

export interface ProactiveRelevanceDecision {
  score: number;
  hasSufficientResults: boolean;
  shouldDiscardProactiveResults: boolean;
  shouldRunLiveSearch: boolean;
}

export function scoreProactiveRelevance(
  userMessage: string,
  results: RelevanceSource[],
): number {
  if (results.length === 0) return 0;

  const keywords = userMessage
    .replace(/[^\u0600-\u06FF\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !ARABIC_STOP_WORDS.has(word));

  // A greeting or short prompt has no reliable keyword signal, so avoid
  // wasting a live search solely because relevance cannot be measured.
  if (keywords.length === 0) return 1;

  const matched = results.filter((result) => {
    const haystack = `${result.title ?? ""} ${result.content ?? ""}`;
    return keywords.some((keyword) => haystack.includes(keyword));
  }).length;

  return matched / results.length;
}

/**
 * Pre-fetched sources may have been generated from consultation metadata rather
 * than the user's first message. Any unrelated cache must never suppress a live
 * search, and is removed from the model context before that search runs.
 */
export function evaluateProactiveRelevance(
  userMessage: string,
  results: RelevanceSource[],
  isFirstUserMessage: boolean,
): ProactiveRelevanceDecision {
  const hasCachedResults = isFirstUserMessage && results.length > 0;
  const hasEnoughCachedResults = hasCachedResults && results.length >= 3;
  const score = hasCachedResults ? scoreProactiveRelevance(userMessage, results) : 0;
  const hasSufficientResults =
    hasEnoughCachedResults && score >= PROACTIVE_RELEVANCE_THRESHOLD;

  return {
    score,
    hasSufficientResults,
    shouldDiscardProactiveResults:
      hasCachedResults && score < PROACTIVE_RELEVANCE_THRESHOLD,
    // One or two relevant pre-fetched results may remain useful context, but
    // they are not enough to replace an on-demand search for the first message.
    shouldRunLiveSearch: hasCachedResults && !hasSufficientResults,
  };
}

/**
 * Removes the specific system message that contains an irrelevant proactive
 * source cache. Kept separate from the route to make the context-removal
 * contract regression-testable.
 */
export function removeIrrelevantProactiveContext<T>(
  messages: T[],
  proactiveContextIndex: number | null,
  shouldDiscardProactiveResults: boolean,
): boolean {
  if (!shouldDiscardProactiveResults || proactiveContextIndex === null) return false;
  messages.splice(proactiveContextIndex, 1);
  return true;
}