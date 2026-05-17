import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMPLIANCE_FINDINGS: BuiltinCollectionDefinition = {
  name: "compliance_findings",
  displayName: "Compliance Findings",
  family: "compliance",
  aliases: ["compliance-finding", "compliance-findings", "compliance_finding", "compliance_findings", "finding", "findings", "grc-finding", "grc-findings"],
  catalog: {
    purpose: "Compliance finding center for control failures, audit issues, severity, ownership, remediation, evidence, and gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Link controlId, assessmentId, and obligationId when known; remediation work can link through entity_relations or tasks.",
    notes: "Findings capture compliance outcomes; data quality issues remain in quality_gaps.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "controlId", type: "relation", relation: { collectionName: "compliance_controls" } },
    { name: "assessmentId", type: "relation", relation: { collectionName: "control_assessments" } },
    { name: "obligationId", type: "relation", relation: { collectionName: "compliance_obligations" } },
    { name: "ownerEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "severity", type: "select", options: ["low", "medium", "high", "critical", "unknown"] },
    { name: "status", type: "select", options: ["open", "triaged", "remediating", "accepted", "closed", "unknown"] },
    { name: "identifiedAt", type: "date" },
    { name: "dueAt", type: "date" },
    { name: "remediation", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "compliance_findings_control_idx", fields: ["controlId"] },
    { name: "compliance_findings_assessment_idx", fields: ["assessmentId"] },
    { name: "compliance_findings_obligation_idx", fields: ["obligationId"] },
    { name: "compliance_findings_status_idx", fields: ["status"] },
    { name: "compliance_findings_severity_idx", fields: ["severity"] },
  ],
};
