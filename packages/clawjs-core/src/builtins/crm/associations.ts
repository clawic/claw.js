import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ASSOCIATIONS: BuiltinCollectionDefinition = {
  name: "associations",
  displayName: "Associations Graph",
  family: "crm",
  aliases: ["association","associations"],
  fields: [
    { name: "fromKind", type: "text", required: true },
    { name: "fromId", type: "text", required: true },
    { name: "toKind", type: "text", required: true },
    { name: "toId", type: "text", required: true },
    { name: "type", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "assoc_from_idx", fields: ["fromKind","fromId"] },
    { name: "assoc_to_idx", fields: ["toKind","toId"] },
    { name: "assoc_unique", fields: ["fromKind","fromId","toKind","toId","type"], unique: true },
  ],
};
