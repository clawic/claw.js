import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ENTITY_LABELS: BuiltinCollectionDefinition = {
  name: "entity_labels",
  displayName: "Entity Labels",
  family: "work",
  aliases: ["entity_label","entity_labels"],
  fields: [
    { name: "entityKind", type: "select", required: true, options: ["issue","task","project","initiative","document"] },
    { name: "entityId", type: "text", required: true },
    { name: "labelId", type: "relation", required: true, relation: { collectionName: "labels" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "entity_labels_unique", fields: ["entityKind","entityId","labelId"], unique: true },
    { name: "entity_labels_label_idx", fields: ["labelId"] },
  ],
};
