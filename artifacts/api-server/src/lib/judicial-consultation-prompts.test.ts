import assert from "node:assert/strict";
import { loadServiceModule } from "./legal-charter";
import { buildProactiveQuery } from "./proactive-rag";
import { getTaskPromptBuilder } from "./task-types";

const tasks = [
  {
    id: "judicial",
    modulePhrase: "مقابلة قضائية",
    promptPhrase: "الاستشارة القضائية التفاعلية",
    queryPhrase: "النظام القضائي السعودي",
    params: { initial_info: "صدر إشعار بمطالبة مالية ولم تحدد المحكمة بعد." },
  },
  {
    id: "case_management",
    modulePhrase: "ملف قضية متدرج",
    promptPhrase: "إدارة القضية القضائية",
    queryPhrase: "إدارة القضية القضائية السعودية",
    params: {
      subject: "مطالبة مالية",
      facts: "توجد جلسة قادمة ومذكرة جوابية تحتاج إلى تنظيم.",
      documents: "عقد وفاتورة",
    },
  },
  {
    id: "judgment_analysis",
    modulePhrase: "حكماً أو قراراً قضائياً",
    promptPhrase: "تحليل الأحكام القضائية",
    queryPhrase: "تحليل الأحكام السعودية",
    params: {
      facts: "حكم ابتدائي مع أسباب مختصرة.",
      documents: "صورة الحكم",
    },
  },
] as const;

for (const task of tasks) {
  const module = loadServiceModule(task.id);
  assert.ok(module, `${task.id} must have an authored service module`);
  assert.ok(module.includes(task.modulePhrase), `${task.id} must contain its specialist instructions`);
  assert.ok(!module.includes("قيد التحرير"), `${task.id} must not use a placeholder module`);

  const builder = getTaskPromptBuilder(task.id);
  assert.ok(builder, `${task.id} must have a structured task prompt builder`);
  const prompt = builder.buildSystemPrompt(task.params, "المملكة العربية السعودية");
  assert.match(prompt, new RegExp(task.promptPhrase));
  assert.match(prompt, /يُمنع تقديم توقع|لا تتنبأ|لا تعطِ توقعاً|لا تدّعِ صفة القاضي/);

  const query = buildProactiveQuery(task.id, task.params);
  assert.ok(query, `${task.id} must have a proactive legal-source query`);
  assert.ok(query.includes(task.queryPhrase), `${task.id} must use a task-specific legal-source query`);
}

console.log("Judicial consultation prompt policy passed");
