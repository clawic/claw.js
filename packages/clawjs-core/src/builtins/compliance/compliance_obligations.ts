import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMPLIANCE_OBLIGATIONS: BuiltinCollectionDefinition = {
  name: "compliance_obligations",
  displayName: "Compliance Obligations",
  family: "compliance",
  aliases: ["obligation", "obligations", "compliance-obligation", "compliance-obligations", "compliance_obligation", "compliance_obligations", "requirement", "requirements"],
  catalog: {
    purpose: "Regulatory, contractual, policy, or standards obligation center for scope, authority, applicability, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId for applicability; controls, assessments, and findings link back to obligations instead of duplicating the requirement text.",
    notes: "Obligations are the source requirements that controls answer; they are separate from runtime policy-gate decisions.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "authority", type: "text" },
    { name: "reference", type: "text" },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "status", type: "select", options: ["applicable", "not_applicable", "under_review", "superseded", "unknown"] },
    { name: "effectiveAt", type: "date" },
    { name: "reviewBy", type: "date" },
    { name: "text", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "compliance_obligations_title_idx", fields: ["title"] },
    { name: "compliance_obligations_company_idx", fields: ["companyId"] },
    { name: "compliance_obligations_reference_idx", fields: ["reference"] },
    { name: "compliance_obligations_status_idx", fields: ["status"] },
  ],
};
