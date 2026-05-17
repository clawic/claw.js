import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_REQUIREMENTS: BuiltinCollectionDefinition = {
  name: "product_requirements",
  displayName: "Product Requirements",
  family: "product",
  aliases: ["product-requirement", "product-requirements", "product_requirement", "product_requirements", "plm-requirement", "plm-requirements"],
  catalog: {
    purpose: "Product requirement center for market, engineering, compliance, quality, and customer requirements.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use productSpecId for the spec under control and sourceRequirementId when tracing to external systems.",
    notes: "Requirements are product lifecycle constraints; compliance obligations remain in compliance_obligations.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "productSpecId", type: "relation", relation: { collectionName: "product_specs" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "requirementType", type: "select", options: ["market", "engineering", "compliance", "quality", "customer", "manufacturing", "other", "unknown"] },
    { name: "status", type: "select", options: ["proposed", "accepted", "implemented", "verified", "rejected", "superseded", "unknown"] },
    { name: "priority", type: "select", options: ["low", "normal", "high", "critical", "unknown"] },
    { name: "sourceRequirementId", type: "text" },
    { name: "description", type: "markdown" },
    { name: "acceptanceCriteria", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "product_requirements_title_idx", fields: ["title"] },
    { name: "product_requirements_spec_idx", fields: ["productSpecId"] },
    { name: "product_requirements_product_idx", fields: ["productCatalogId"] },
    { name: "product_requirements_status_idx", fields: ["status"] },
    { name: "product_requirements_priority_idx", fields: ["priority"] },
  ],
};
