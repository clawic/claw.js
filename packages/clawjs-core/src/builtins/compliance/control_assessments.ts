import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTROL_ASSESSMENTS: BuiltinCollectionDefinition = {
  name: "control_assessments",
  displayName: "Control Assessments",
  family: "compliance",
  aliases: ["control-assessment", "control-assessments", "control_assessment", "control_assessments", "assessment", "assessments"],
  catalog: {
    purpose: "Control assessment center for test result, assessor, evidence, exceptions, and assessment cadence.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Every assessment belongs to a compliance control; link obligationId when assessment evidence is specific to a requirement.",
    notes: "Assessments are point-in-time evaluations and should not overwrite the control definition.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "summary"] },
    { name: "controlId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "compliance_controls" } },
    { name: "obligationId", type: "relation", relation: { collectionName: "compliance_obligations" } },
    { name: "assessorEmployeeId", type: "relation", relation: { collectionName: "employees" } },
    { name: "result", type: "select", options: ["pass", "fail", "partial", "not_tested", "not_applicable", "unknown"] },
    { name: "status", type: "select", options: ["planned", "in_progress", "completed", "accepted", "retest_required", "unknown"] },
    { name: "assessedAt", type: "date" },
    { name: "periodStartAt", type: "date" },
    { name: "periodEndAt", type: "date" },
    { name: "notes", type: "markdown" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "control_assessments_control_idx", fields: ["controlId"] },
    { name: "control_assessments_obligation_idx", fields: ["obligationId"] },
    { name: "control_assessments_result_idx", fields: ["result"] },
    { name: "control_assessments_status_idx", fields: ["status"] },
  ],
};
