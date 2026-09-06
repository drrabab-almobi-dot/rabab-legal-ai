import assert from "node:assert/strict";
import {
  getActiveServiceModules,
  getPublicServiceModules,
  getServiceModule,
  getTopicRoutingServices,
} from "./service-registry";

const inheritance = getServiceModule("inheritance-distribution");
assert.ok(inheritance, "The planned inheritance module must remain registered.");
assert.equal(inheritance.status, "planned");
assert.equal(inheritance.requiresDedicatedWorkflow, true);
assert.equal(inheritance.capabilities.acceptsBeneficiaryFiles, true);
assert.equal(inheritance.capabilities.wordExport, true);
assert.equal(inheritance.supervision.supervisor, "د. رباب أحمد المعبي");

const activeIds = getActiveServiceModules().map((service) => service.id);
assert.ok(activeIds.includes("consultation"));
assert.ok(activeIds.includes("intellectual-property"));
assert.ok(activeIds.includes("corporate-governance-compliance"));
assert.ok(activeIds.includes("commercial-arbitration"));
assert.ok(activeIds.includes("conciliation"));
assert.ok(!activeIds.includes("inheritance-distribution"));

const routedIds = getTopicRoutingServices().map((service) => service.id);
assert.ok(routedIds.includes("research"));
assert.ok(routedIds.includes("intellectual-property"));
assert.ok(routedIds.includes("corporate-governance-compliance"));
assert.ok(routedIds.includes("commercial-arbitration"));
assert.ok(routedIds.includes("conciliation"));
assert.ok(!routedIds.includes("inheritance-distribution"));

const publicInheritance = getPublicServiceModules().find((service) => service.id === "inheritance-distribution");
assert.equal(publicInheritance, undefined, "Planned services must remain hidden from public clients.");

const publicIds = getPublicServiceModules().map((service) => service.id);
const auditedActiveServiceIds = [
  "consultation",
  "judicial",
  "pleadings",
  "contracts",
  "intellectual-property",
  "corporate-governance-compliance",
  "commercial-arbitration",
  "conciliation",
  "research",
];
assert.deepEqual(
  [...publicIds].sort(),
  [...auditedActiveServiceIds].sort(),
  "The public service API must exactly match the audited active service set.",
);

console.log("service-registry tests passed");
