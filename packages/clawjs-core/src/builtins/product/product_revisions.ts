import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_REVISIONS: BuiltinCollectionDefinition = {
  name: "product_revisions",
  displayName: "Product Revisions",
  family: "product",
  aliases: ["product-revision", "product-revisions", "product_revision", "product_revisions", "engineering-revision", "engineering-revisions"],
  catalog: {
    purpose: "Product revision center for versioned spec changes, release status, approvals, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use productSpecId for the lifecycle spec and productCatalogId when a revision directly affects a catalog product.",
    notes: "Revisions describe product lifecycle change; they are not software releases or accounting ledger entries.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "productSpecId", type: "relation", relation: { collectionName: "product_specs" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "revision", type: "text", aliases: ["version"] },
    { name: "status", type: "select", options: ["draft", "in_review", "approved", "released", "superseded", "cancelled", "unknown"] },
    { name: "changeType", type: "select", options: ["minor", "major", "regulatory", "cost", "quality", "supplier", "other", "unknown"] },
    { name: "releasedAt", type: "date" },
    { name: "approvedAt", type: "date" },
    { name: "changeSummary", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "product_revisions_title_idx", fields: ["title"] },
    { name: "product_revisions_spec_idx", fields: ["productSpecId"] },
    { name: "product_revisions_product_idx", fields: ["productCatalogId"] },
    { name: "product_revisions_revision_idx", fields: ["revision"] },
    { name: "product_revisions_status_idx", fields: ["status"] },
  ],
};
