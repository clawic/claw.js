import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONSTRUCTION_RFIS: BuiltinCollectionDefinition = {
  name: "construction_rfis",
  displayName: "Construction RFIs",
  family: "construction",
  aliases: ["construction-rfi", "construction-rfis", "construction_rfi", "construction_rfis", "rfi", "rfis"],
  catalog: {
    purpose: "Request-for-information center for questions, responsible parties, due dates, answers, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link projectId and siteId; use requesterEmployeeId/responderEmployeeId for accountable people when known.",
    notes: "RFIs are formal construction information requests, separate from generic notes or comments.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["subject", "question"] },
    { name: "projectId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "construction_projects" } },
    { name: "siteId", type: "relation", relation: { collectionName: "construction_sites" } },
    { name: "number", type: "text" },
    { name: "status", type: "select", options: ["draft", "open", "answered", "closed", "void", "unknown"] },
    { name: "requestedAt", type: "date" },
    { name: "dueAt", type: "date" },
    { name: "answeredAt", type: "date" },
    { name: "requesterEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "responderEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "answer", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "construction_rfis_project_idx", fields: ["projectId"] },
    { name: "construction_rfis_site_idx", fields: ["siteId"] },
    { name: "construction_rfis_number_idx", fields: ["number"] },
    { name: "construction_rfis_status_idx", fields: ["status"] },
  ],
};
