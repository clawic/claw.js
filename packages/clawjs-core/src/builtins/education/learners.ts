import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LEARNERS: BuiltinCollectionDefinition = {
  name: "learners",
  displayName: "Learners",
  family: "education",
  aliases: ["learner", "learners", "student", "students"],
  catalog: {
    purpose: "Learner role/profile over shared identity for courses, assignments, assessments, progress, and credentials.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use personId when known; course progress and assessments should link to learnerId rather than duplicating identity.",
    notes: "Learner is a role/profile over shared identity, not a separate person system.",
  },
  fields: [
    { name: "personId", type: "relation", relation: { collectionName: "people" } },
    { name: "displayName", type: "text", required: true, requiredReason: "identity", aliases: ["name", "learnerName", "studentName"] },
    { name: "status", type: "select", options: ["active", "inactive", "graduated", "withdrawn", "unknown"] },
    { name: "program", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "learners_person_idx", fields: ["personId"] },
    { name: "learners_display_name_idx", fields: ["displayName"] },
    { name: "learners_status_idx", fields: ["status"] },
  ],
};
