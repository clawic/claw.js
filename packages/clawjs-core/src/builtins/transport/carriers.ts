import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CARRIERS: BuiltinCollectionDefinition = {
  name: "carriers",
  displayName: "Carriers",
  family: "transport",
  aliases: ["carrier", "carriers", "freight-carrier", "freight-carriers"],
  catalog: {
    purpose: "Transport carrier center for shipment execution, modes, identifiers, contacts, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId for the operating entity; shipments, shipment legs, and freight rates link back to carriers.",
    notes: "Carrier identity is separate from suppliers and travel transport bookings; use relations if the same company is also a supplier.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["carrierName"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "scac", type: "text" },
    { name: "mode", type: "select", options: ["parcel", "ltl", "ftl", "ocean", "air", "rail", "courier", "multimodal", "other", "unknown"] },
    { name: "status", type: "select", options: ["active", "inactive", "blocked", "unknown"] },
    { name: "contact", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "carriers_name_idx", fields: ["name"] },
    { name: "carriers_company_idx", fields: ["companyId"] },
    { name: "carriers_scac_idx", fields: ["scac"] },
    { name: "carriers_status_idx", fields: ["status"] },
  ],
};
