import assert from "node:assert/strict";
import {
  evaluateProactiveRelevance,
  removeIrrelevantProactiveContext,
  scoreProactiveRelevance,
} from "./proactive-relevance";

const unrelatedResults = [
  { title: "نظام العمل", content: "أحكام عقود العمل وحقوق العامل" },
  { title: "لائحة الموارد البشرية", content: "واجبات الموظف وصاحب العمل" },
  { title: "قرار عمالي", content: "تعويضات الفصل وإنهاء علاقة العمل" },
];

const relevantResults = [
  { title: "نظام الإيجار", content: "أحكام عقد الإيجار السكني والتجاري" },
  { title: "قرار بشأن الإيجار", content: "فسخ عقد الإيجار عند التأخر في السداد" },
  { title: "لائحة التنفيذ", content: "التزامات المؤجر والمستأجر في الإيجار" },
];

const irrelevantDecision = evaluateProactiveRelevance(
  "أريد معرفة شروط فسخ عقد الإيجار",
  unrelatedResults,
  true,
);
assert.equal(irrelevantDecision.hasSufficientResults, false);
assert.equal(irrelevantDecision.shouldDiscardProactiveResults, true);
assert.equal(irrelevantDecision.shouldRunLiveSearch, true);
assert.equal(irrelevantDecision.score, 0);

const oneResultContext = ["charter", "proactive-result", "latest-user-message"];
const oneResultDecision = evaluateProactiveRelevance(
  "أريد معرفة شروط فسخ عقد الإيجار",
  unrelatedResults.slice(0, 1),
  true,
);
assert.equal(oneResultDecision.shouldDiscardProactiveResults, true);
assert.equal(oneResultDecision.shouldRunLiveSearch, true);
assert.equal(removeIrrelevantProactiveContext(oneResultContext, 1, oneResultDecision.shouldDiscardProactiveResults), true);
assert.deepEqual(oneResultContext, ["charter", "latest-user-message"]);

const twoResultContext = ["charter", "proactive-results", "latest-user-message"];
const twoResultDecision = evaluateProactiveRelevance(
  "أريد معرفة شروط فسخ عقد الإيجار",
  unrelatedResults.slice(0, 2),
  true,
);
assert.equal(twoResultDecision.shouldDiscardProactiveResults, true);
assert.equal(twoResultDecision.shouldRunLiveSearch, true);
assert.equal(removeIrrelevantProactiveContext(twoResultContext, 1, twoResultDecision.shouldDiscardProactiveResults), true);
assert.deepEqual(twoResultContext, ["charter", "latest-user-message"]);

const relevantDecision = evaluateProactiveRelevance(
  "أريد معرفة شروط فسخ عقد الإيجار",
  relevantResults,
  true,
);
assert.equal(relevantDecision.hasSufficientResults, true);
assert.equal(relevantDecision.shouldDiscardProactiveResults, false);
assert.equal(relevantDecision.shouldRunLiveSearch, false);
assert.ok(relevantDecision.score >= 0.4);

const partialDecision = evaluateProactiveRelevance(
  "أريد معرفة شروط فسخ عقد الإيجار",
  relevantResults.slice(0, 2),
  true,
);
assert.equal(partialDecision.hasSufficientResults, false);
assert.equal(partialDecision.shouldDiscardProactiveResults, false);
assert.equal(partialDecision.shouldRunLiveSearch, true);

assert.equal(scoreProactiveRelevance("شكراً", unrelatedResults), 1);

console.log("proactive relevance tests passed");