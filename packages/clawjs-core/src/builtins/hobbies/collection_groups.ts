import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COLLECTION_GROUPS: BuiltinCollectionDefinition = {
  name: "collection_groups",
  displayName: "Collection Groups",
  family: "hobbies",
  aliases: ["collection_group","collection_groups"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "category", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "collection_groups_name_idx", fields: ["name"] },
  ],
};
