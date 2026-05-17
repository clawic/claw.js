import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LEGAL_CASES: BuiltinCollectionDefinition = {
  name: "legal_cases",
  displayName: "Legal Cases",
  family: "legal",
  aliases: ["case", "cases", "legal_case", "legal_cases", "matter", "matters"],
  catalog: {
    purpose: "Legal matter/case center for parties, facts, evidence, filings, deadlines, decisions, documents, and provenance.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use legal cases as the matter anchor; evidence, filings, parties, deadlines, and notes should point to the case instead of duplicating matter identity.",
    notes: "Legal advice and final legal decisioning remain out of scope; this collection structures matter data and evidence.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "caseName", "matterName"] },
    { name: "caseNumber", type: "text" },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "clientPersonId", type: "relation", relation: { collectionName: "people" } },
    { name: "clientCompanyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "jurisdiction", type: "text" },
    { name: "practiceArea", type: "text" },
    { name: "status", type: "select", options: ["open", "pending", "closed", "archived"] },
    { name: "openedAt", type: "date" },
    { name: "closedAt", type: "date" },
    { name: "summary", type: "text" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "legal_cases_title_idx", fields: ["title"] },
    { name: "legal_cases_number_idx", fields: ["caseNumber"] },
    { name: "legal_cases_status_idx", fields: ["status"] },
    { name: "legal_cases_company_idx", fields: ["companyId"] },
  ],
};
