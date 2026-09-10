import assert from "node:assert/strict";
import {
  CRITICAL_SCHEMA_STATEMENTS,
  ensureCriticalSchema,
  resetCriticalSchemaReadinessForTests,
  type SqlExecutor,
} from "./critical-schema.js";

const statements = CRITICAL_SCHEMA_STATEMENTS.join("\n");
assert.match(statements, /consultation_messages[\s\S]*attachment_name/);
assert.match(statements, /consultation_messages[\s\S]*used_live_search/);
assert.match(statements, /consultations[\s\S]*service_session_id/);

resetCriticalSchemaReadinessForTests();
const executed: string[] = [];
const executor: SqlExecutor = {
  async query(sql: string) {
    executed.push(sql);
  },
};

await Promise.all([
  ensureCriticalSchema(executor),
  ensureCriticalSchema(executor),
]);
assert.equal(
  executed.length,
  1,
  "concurrent readiness checks must share one migration promise",
);

resetCriticalSchemaReadinessForTests();
let attempts = 0;
const flakyExecutor: SqlExecutor = {
  async query() {
    attempts += 1;
    if (attempts === 1) throw new Error("temporary database outage");
  },
};
await assert.rejects(
  ensureCriticalSchema(flakyExecutor),
  /temporary database outage/,
);
await ensureCriticalSchema(flakyExecutor);
assert.ok(attempts > 1, "a failed readiness check must be retryable");

console.log("critical schema readiness tests passed");
