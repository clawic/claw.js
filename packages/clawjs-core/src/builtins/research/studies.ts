import type { BuiltinCollectionDefinition } from "../_types.ts";

export const STUDIES: BuiltinCollectionDefinition = {
  name: "studies",
  displayName: "Studies",
  family: "research",
  aliases: ["study", "studies", "research_study", "research_studies", "trial", "trials"],
  catalog: {
    purpose: "Research protocol/study center for participants, cohorts, events, consent, documents, evidence, and analysis readiness.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use studies as the research anchor; participants, samples, forms, evidence, and analyses should point to the study.",
    notes: "Maps outward to CTMS/CDISC/FHIR concepts without cloning those standards as the internal schema.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "studyTitle"] },
    { name: "protocolId", type: "text" },
    { name: "sponsorCompanyId", type: "relation", relation: { collectionName: "companies" } },
    { name: "principalInvestigatorId", type: "relation", relation: { collectionName: "people" } },
    { name: "status", type: "select", options: ["planned", "recruiting", "active", "paused", "completed", "terminated", "unknown"] },
    { name: "phase", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "summary", type: "text" },
    { name: "criteria", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "studies_title_idx", fields: ["title"] },
    { name: "studies_protocol_idx", fields: ["protocolId"] },
    { name: "studies_status_idx", fields: ["status"] },
  ],
};
