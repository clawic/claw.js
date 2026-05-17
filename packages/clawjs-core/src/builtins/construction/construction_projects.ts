import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONSTRUCTION_PROJECTS: BuiltinCollectionDefinition = {
  name: "construction_projects",
  displayName: "Construction Projects",
  family: "construction",
  aliases: ["construction-project", "construction-projects", "construction_project", "construction_projects", "build-project", "build-projects"],
  catalog: {
    purpose: "Construction project center for owners, contract scope, schedule, budget, sites, RFIs, changes, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId for the managing company and customerCompanyId for the owner/client; related sites, RFIs, and change orders carry projectId.",
    notes: "This is construction-specific project control, not the generic work/projects collection.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "projectName"] },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "customerCompanyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "status", type: "select", options: ["planning", "active", "paused", "substantial_completion", "closed", "cancelled", "unknown"] },
    { name: "contractNumber", type: "text" },
    { name: "startAt", type: "date" },
    { name: "targetCompletionAt", type: "date" },
    { name: "budgetCents", type: "number", min: 0 },
    { name: "currency", type: "currency" },
    { name: "scope", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "construction_projects_title_idx", fields: ["title"] },
    { name: "construction_projects_company_idx", fields: ["companyId"] },
    { name: "construction_projects_customer_idx", fields: ["customerCompanyId"] },
    { name: "construction_projects_status_idx", fields: ["status"] },
  ],
};
