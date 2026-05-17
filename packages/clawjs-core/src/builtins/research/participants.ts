import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PARTICIPANTS: BuiltinCollectionDefinition = {
  name: "participants",
  displayName: "Participants",
  family: "research",
  aliases: ["participant", "participants", "research_subject", "research_subjects"],
  catalog: {
    purpose: "Research participant role/profile over shared identity, linked to studies, consent, cohorts, events, and quality gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use personId when known; otherwise preserve partial participant identity and gaps without inventing a shared person.",
    notes: "A participant is a domain role/profile, not a duplicate person identity.",
  },
  fields: [
    { name: "studyId", type: "relation", relation: { collectionName: "studies" }, aliases: ["study"] },
    { name: "personId", type: "relation", relation: { collectionName: "people" } },
    { name: "displayName", type: "text", required: true, requiredReason: "identity", aliases: ["name", "participantName"] },
    { name: "subjectCode", type: "text" },
    { name: "status", type: "select", options: ["screening", "enrolled", "withdrawn", "completed", "lost_to_follow_up", "unknown"] },
    { name: "cohort", type: "text" },
    { name: "consentStatus", type: "select", options: ["not_started", "consented", "declined", "withdrawn", "unknown"] },
    { name: "enrolledAt", type: "date" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "participants_study_idx", fields: ["studyId"] },
    { name: "participants_person_idx", fields: ["personId"] },
    { name: "participants_code_idx", fields: ["subjectCode"] },
    { name: "participants_status_idx", fields: ["status"] },
  ],
};
