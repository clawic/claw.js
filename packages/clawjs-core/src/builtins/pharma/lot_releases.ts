import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LOT_RELEASES: BuiltinCollectionDefinition = {
  name: "lot_releases",
  displayName: "Lot Releases",
  family: "pharma",
  aliases: ["lot-release", "lot-releases", "lot_release", "lot_releases", "batch-release", "batch-releases"],
  catalog: {
    purpose: "Lot release center for QA disposition, release decision state, certificates, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use batchRecordId for the manufactured batch and drugProductId for the regulated product.",
    notes: "Local records can represent release state; actual regulated release execution remains gated and audited.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "drugProductId", type: "relation", relation: { collectionName: "drug_products" } },
    { name: "batchRecordId", type: "relation", relation: { collectionName: "batch_records" } },
    { name: "releasedByEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "status", type: "select", options: ["draft", "in_review", "released", "rejected", "quarantined", "unknown"] },
    { name: "disposition", type: "select", options: ["release", "reject", "quarantine", "rework", "unknown"] },
    { name: "releasedAt", type: "date" },
    { name: "certificateNumber", type: "text", aliases: ["coaNumber"] },
    { name: "notes", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "lot_releases_title_idx", fields: ["title"] },
    { name: "lot_releases_drug_product_idx", fields: ["drugProductId"] },
    { name: "lot_releases_batch_idx", fields: ["batchRecordId"] },
    { name: "lot_releases_status_idx", fields: ["status"] },
    { name: "lot_releases_certificate_idx", fields: ["certificateNumber"] },
  ],
};
