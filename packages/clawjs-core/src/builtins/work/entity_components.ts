import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ENTITY_COMPONENTS: BuiltinCollectionDefinition = {
  name: "entity_components",
  displayName: "Entity Components",
  family: "work",
  aliases: ["entity_component","entity_components"],
  fields: [
    { name: "entityKind", type: "select", required: true, options: ["issue","task"] },
    { name: "entityId", type: "text", required: true },
    { name: "componentId", type: "relation", required: true, relation: { collectionName: "components" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "entity_components_unique", fields: ["entityKind","entityId","componentId"], unique: true },
    { name: "entity_components_comp_idx", fields: ["componentId"] },
  ],
};
