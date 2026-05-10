import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HOUSEHOLDS: BuiltinCollectionDefinition = {
  name: "households",
  displayName: "Households",
  family: "possessions",
  aliases: ["household","households"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "address", type: "text" },
    { name: "city", type: "text" },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "households_name_idx", fields: ["name"] },
  ],
};
