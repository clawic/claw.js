import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LIBRARIES: BuiltinCollectionDefinition = {
  name: "libraries",
  displayName: "Libraries",
  family: "reading_media",
  aliases: ["library","libraries"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["personal","shared","lending"] },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "libraries_kind_idx", fields: ["kind"] },
  ],
};
