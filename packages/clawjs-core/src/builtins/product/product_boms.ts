import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_BOMS: BuiltinCollectionDefinition = {
  name: "product_boms",
  displayName: "Product BOMs",
  family: "product",
  aliases: ["product-bom", "product-boms", "product_bom", "product_boms", "bill-of-materials", "bills-of-materials"],
  catalog: {
    purpose: "Product bill-of-materials center for lifecycle-controlled components, quantities, status, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use productSpecId for the owning spec and componentProductCatalogId when the component is a canonical catalog product.",
    notes: "BOMs describe product structure; warehouse stock positions and procurement line items remain separate records.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "productSpecId", type: "relation", relation: { collectionName: "product_specs" } },
    { name: "productCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "componentProductCatalogId", type: "relation", relation: { collectionName: "products_catalog" } },
    { name: "bomVersion", type: "text", aliases: ["version"] },
    { name: "status", type: "select", options: ["draft", "released", "superseded", "retired", "unknown"] },
    { name: "quantity", type: "number", min: 0 },
    { name: "unit", type: "text" },
    { name: "notes", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "product_boms_title_idx", fields: ["title"] },
    { name: "product_boms_spec_idx", fields: ["productSpecId"] },
    { name: "product_boms_product_idx", fields: ["productCatalogId"] },
    { name: "product_boms_component_idx", fields: ["componentProductCatalogId"] },
    { name: "product_boms_status_idx", fields: ["status"] },
  ],
};
