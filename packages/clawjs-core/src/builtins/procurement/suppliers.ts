import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPLIERS: BuiltinCollectionDefinition = {
  name: "suppliers",
  displayName: "Suppliers",
  family: "procurement",
  aliases: ["supplier", "suppliers", "vendor", "vendors"],
  catalog: {
    purpose: "Supplier/vendor center for procurement records, company identity links, contacts, documents, status, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId when the supplier is also represented in companies; keep supplier-specific procurement state here.",
    notes: "This is a vendor role/profile over shared company identity, not a duplicate company database.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["supplierName", "vendorName"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "contactName", type: "text" },
    { name: "email", type: "email" },
    { name: "phone", type: "phone" },
    { name: "status", type: "select", options: ["active", "inactive", "prospective", "blocked", "unknown"] },
    { name: "category", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "suppliers_name_idx", fields: ["name"] },
    { name: "suppliers_company_idx", fields: ["companyId"] },
    { name: "suppliers_status_idx", fields: ["status"] },
    { name: "suppliers_email_idx", fields: ["email"] },
  ],
};
