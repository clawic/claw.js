import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMPANIES: BuiltinCollectionDefinition = {
  name: "companies",
  displayName: "Companies",
  family: "crm",
  aliases: ["company", "companies", "organization", "organizations", "org", "orgs"],
  catalog: {
    purpose: "Shared organization/company center for CRM, ERP, billing, legal, procurement, finance, and support records.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companies as the common organization anchor; domain-specific account, billing customer, supplier, or legal-party roles should point here instead of duplicating company identity.",
    notes: "This is a shared identity/profile center for organizations, not a full ERP supercollection.",
  },
  fields: [
    { name: "name", type: "text", required: true, requiredReason: "identity", aliases: ["companyName", "organizationName"] },
    { name: "legalName", type: "text" },
    { name: "domain", type: "text" },
    { name: "website", type: "text" },
    { name: "industry", type: "text" },
    { name: "taxId", type: "text" },
    { name: "country", type: "text" },
    { name: "address", type: "json" },
    { name: "externalSource", type: "text" },
    { name: "externalId", type: "text" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "companies_name_idx", fields: ["name"] },
    { name: "companies_domain_idx", fields: ["domain"] },
    { name: "companies_external_unique", fields: ["externalSource", "externalId"], unique: true },
  ],
};
