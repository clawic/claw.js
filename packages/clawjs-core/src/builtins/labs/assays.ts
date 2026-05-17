import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ASSAYS: BuiltinCollectionDefinition = {
  name: "assays",
  displayName: "Assays",
  family: "labs",
  aliases: ["assay", "assays", "test", "tests"],
  catalog: {
    purpose: "Lab assay/test center for measured values, methods, instruments, samples, result state, and quality criteria.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use sampleId when the assay is performed on a known sample; use vocabulary/code fields for standards mapping where available.",
    notes: "Assays can represent clinical tests or research assays while keeping standards as mappings, not mandatory schema clones.",
  },
  fields: [
    { name: "sampleId", type: "relation", relation: { collectionName: "samples" }, aliases: ["sample"] },
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["assayName", "testName"] },
    { name: "codeSystem", type: "text" },
    { name: "code", type: "text" },
    { name: "status", type: "select", options: ["ordered", "running", "completed", "failed", "cancelled", "unknown"] },
    { name: "result", type: "json" },
    { name: "unit", type: "text" },
    { name: "method", type: "text" },
    { name: "instrumentId", type: "text" },
    { name: "performedAt", type: "date" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "assays_sample_idx", fields: ["sampleId"] },
    { name: "assays_name_idx", fields: ["name"] },
    { name: "assays_code_idx", fields: ["codeSystem", "code"] },
    { name: "assays_status_idx", fields: ["status"] },
  ],
};
