import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WAREHOUSES: BuiltinCollectionDefinition = {
  name: "warehouses",
  displayName: "Warehouses",
  family: "warehouse",
  aliases: ["warehouse", "warehouses", "fulfillment-center", "fulfillment-centers"],
  catalog: {
    purpose: "Warehouse/location center for inventory, stock movements, documents, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId for ownership; inventory_items and stock_movements point back to this warehouse.",
    notes: "This is a WMS location center, separate from home inventory and shipment/transport execution.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["warehouseName"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "code", type: "text" },
    { name: "status", type: "select", options: ["active", "inactive", "planned", "closed", "unknown"] },
    { name: "address", type: "address" },
    { name: "timezone", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "warehouses_name_idx", fields: ["name"] },
    { name: "warehouses_company_idx", fields: ["companyId"] },
    { name: "warehouses_code_idx", fields: ["code"] },
    { name: "warehouses_status_idx", fields: ["status"] },
  ],
};
