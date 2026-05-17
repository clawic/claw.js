import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ENTITY_RELATIONS: BuiltinCollectionDefinition = {
  name: "entity_relations",
  displayName: "Entity Relations",
  family: "work",
  aliases: ["relation","relations","entity_relation","entity_relations","universal_relation","universal_relations"],
  catalog: {
    purpose: "Stores typed universal relationships between any two records or entities, including work issue links and dense-domain cross-system links.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use fromEntityKind/fromEntityId and toEntityKind/toEntityId for extensible links; keep direct relation fields for central stable links.",
    notes: "Pre-v1 reset: this generalizes the old issue/task-only relation table instead of adding a parallel relation graph.",
  },
  fields: [
    { name: "fromEntityKind", type: "text", required: true, requiredReason: "relation_integrity" },
    { name: "fromEntityId", type: "text", required: true },
    { name: "toEntityKind", type: "text", required: true, requiredReason: "relation_integrity" },
    { name: "toEntityId", type: "text", required: true },
    { name: "type", type: "select", required: true, options: ["blocks","blocked_by","duplicates","duplicated_by","relates","clones","cloned_by","parent","child","member_of","owns","depends_on","evidence_for","derived_from","same_as","references"] },
    { name: "createdByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "entity_relations_from_idx", fields: ["fromEntityKind","fromEntityId"] },
    { name: "entity_relations_to_idx", fields: ["toEntityKind","toEntityId"] },
    { name: "entity_relations_unique", fields: ["fromEntityKind","fromEntityId","toEntityKind","toEntityId","type"], unique: true },
  ],
};
