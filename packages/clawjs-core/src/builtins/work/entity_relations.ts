import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ENTITY_RELATIONS: BuiltinCollectionDefinition = {
  name: "entity_relations",
  displayName: "Entity Relations",
  family: "work",
  aliases: ["relation","relations","entity_relation","entity_relations"],
  fields: [
    { name: "fromEntityKind", type: "select", required: true, options: ["issue","task"] },
    { name: "fromEntityId", type: "text", required: true },
    { name: "toEntityKind", type: "select", required: true, options: ["issue","task"] },
    { name: "toEntityId", type: "text", required: true },
    { name: "type", type: "select", required: true, options: ["blocks","blocked_by","duplicates","duplicated_by","relates","clones","cloned_by","parent","child"] },
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
