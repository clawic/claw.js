import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PLANTS: BuiltinCollectionDefinition = {
  name: "plants",
  displayName: "Plants",
  family: "garden",
  aliases: ["plant","plants"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "species", type: "text" },
    { name: "location", type: "text" },
    { name: "acquiredAt", type: "date" },
    { name: "waterCadence", type: "text" },
    { name: "lightNeed", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "plants_name_idx", fields: ["name"] },
  ],
};
