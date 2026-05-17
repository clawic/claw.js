import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BIOLOGY_EXPERIMENTS: BuiltinCollectionDefinition = {
  name: "biology_experiments",
  displayName: "Biology Experiments",
  family: "biology",
  aliases: ["biology_experiment", "biology_experiments", "bio_experiment", "bio_experiments"],
  catalog: {
    purpose: "Biology/ELN experiment center for organisms, samples, assays, protocols, observations, evidence, and timeline views.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use studyId for research context, organismId for biological source, and sample/assay child routes for measured evidence.",
    notes: "Named separately from product analytics experiments to avoid a double system with analytics A/B tests.",
  },
  fields: [
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name", "experimentName"] },
    { name: "studyId", type: "relation", relation: { collectionName: "studies" } },
    { name: "organismId", type: "relation", relation: { collectionName: "organisms" } },
    { name: "status", type: "select", options: ["planned", "running", "completed", "failed", "cancelled", "unknown"] },
    { name: "protocol", type: "json" },
    { name: "hypothesis", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "observations", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "biology_experiments_title_idx", fields: ["title"] },
    { name: "biology_experiments_study_idx", fields: ["studyId"] },
    { name: "biology_experiments_organism_idx", fields: ["organismId"] },
    { name: "biology_experiments_status_idx", fields: ["status"] },
  ],
};
