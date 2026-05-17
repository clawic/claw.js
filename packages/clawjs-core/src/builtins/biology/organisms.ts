import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ORGANISMS: BuiltinCollectionDefinition = {
  name: "organisms",
  displayName: "Organisms",
  family: "biology",
  aliases: ["organism", "organisms", "biological_entity", "biological_entities"],
  catalog: {
    purpose: "Biological organism/entity center for samples, assays, observations, datasets, evidence, and provenance.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use organismId from samples, experiments, observations, and datasets when the biological source is known; keep taxonomy/code evidence separate from identity.",
    notes: "This collection models biological subjects/materials, not clinical patient identity.",
  },
  fields: [
    { name: "label", type: "text", required: true, requiredReason: "identity", aliases: ["name", "organismName"] },
    { name: "species", type: "text" },
    { name: "strain", type: "text" },
    { name: "taxonomyId", type: "text" },
    { name: "status", type: "select", options: ["active", "archived", "unknown"] },
    { name: "source", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "organisms_label_idx", fields: ["label"] },
    { name: "organisms_species_idx", fields: ["species"] },
    { name: "organisms_taxonomy_idx", fields: ["taxonomyId"] },
  ],
};
