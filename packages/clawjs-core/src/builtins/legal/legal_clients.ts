import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LEGAL_CLIENTS: BuiltinCollectionDefinition = {
  name: "legal_clients",
  displayName: "Legal Clients",
  family: "legal",
  aliases: ["legal-client", "legal-clients", "legal_client", "legal_clients"],
  catalog: {
    purpose: "Legal client role/profile over a person or organization, optionally scoped to a case or matter without duplicating base identity.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use personId or companyId for shared identity and caseId when the role is matter-specific; detailed legal facts remain on cases, evidence, documents, and typed relations.",
    notes: "This is a legal role/profile record, not a second identity system and not legal advice.",
  },
  fields: [
    { name: "displayName", type: "text", required: true, requiredReason: "identity", aliases: ["name", "clientName"] },
    { name: "caseId", type: "relation", relation: { collectionName: "legal_cases" }, aliases: ["case", "matterId"] },
    { name: "personId", type: "relation", relation: { collectionName: "people" } },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "role", type: "select", options: ["client", "prospective_client", "beneficiary", "guardian", "representative", "other"] },
    { name: "status", type: "select", options: ["active", "prospective", "inactive", "archived"] },
    { name: "conflictStatus", type: "select", options: ["unknown", "clear", "possible_conflict", "conflict"] },
    { name: "openedAt", type: "date" },
    { name: "evidenceSourceIds", type: "json" },
    { name: "qualityGapIds", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "legal_clients_case_idx", fields: ["caseId"] },
    { name: "legal_clients_person_idx", fields: ["personId"] },
    { name: "legal_clients_company_idx", fields: ["companyId"] },
    { name: "legal_clients_status_idx", fields: ["status"] },
  ],
};
