import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_SPECS: BuiltinCollectionDefinition = {
  name: "product_specs",
  displayName: "Product Specs",
  family: "product",
  aliases: ["product-spec", "product-specs", "product_spec", "product_specs", "pim-spec", "pim-specs"],
  catalog: {
    purpose: "PIM/PLM specification center for canonical product catalog records, lifecycle stage, ownership, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use productCatalogId for the canonical sellable or operational product and companyId for the owning organization.",
    notes: "This is the product lifecycle/specification layer; the top-level `product` route remains backed by products_catalog.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "specName"] },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "sku", type: "text" },
    { name: "status", type: "select", options: ["draft", "active", "deprecated", "retired", "unknown"] },
    { name: "lifecycleStage", type: "select", options: ["concept", "design", "validation", "released", "end_of_life", "unknown"] },
    { name: "ownerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "description", type: "markdown" },
    { name: "attributes", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "product_specs_title_idx", fields: ["title"] },
    { name: "product_specs_product_idx", fields: ["productCatalogId"] },
    { name: "product_specs_company_idx", fields: ["companyId"] },
    { name: "product_specs_sku_idx", fields: ["sku"] },
    { name: "product_specs_status_idx", fields: ["status"] },
  ],
};
