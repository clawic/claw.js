import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMPLIANCE_CONTROLS: BuiltinCollectionDefinition = {
  name: "compliance_controls",
  displayName: "Compliance Controls",
  family: "compliance",
  aliases: ["control", "controls", "compliance-control", "compliance-controls", "compliance_control", "compliance_controls"],
  catalog: {
    purpose: "Control center for GRC frameworks, owners, obligation mapping, implementation status, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use companyId for scope, ownerEmployeeId for accountability, and obligationId when a legal/regulatory obligation is the source.",
    notes: "This is compliance control data, not an agents policy gate or generic project-health audit record.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "controlKey", type: "text", aliases: ["controlId", "reference"] },
    { name: "framework", type: "text" },
    { name: "companyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "obligationId", type: "relation", relation: { collectionName: "compliance_obligations" } },
    { name: "ownerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "status", type: "select", options: ["draft", "implemented", "partially_implemented", "not_implemented", "retired", "unknown"] },
    { name: "controlType", type: "select", options: ["preventive", "detective", "corrective", "governance", "technical", "administrative", "unknown"] },
    { name: "description", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "compliance_controls_key_idx", fields: ["controlKey"] },
    { name: "compliance_controls_company_idx", fields: ["companyId"] },
    { name: "compliance_controls_obligation_idx", fields: ["obligationId"] },
    { name: "compliance_controls_status_idx", fields: ["status"] },
  ],
};
