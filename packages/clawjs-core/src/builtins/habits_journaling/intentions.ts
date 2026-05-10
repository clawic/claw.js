import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INTENTIONS: BuiltinCollectionDefinition = {
  name: "intentions",
  displayName: "Intentions",
  family: "habits_journaling",
  aliases: ["intention","intentions"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "forDate", type: "date" },
    { name: "scope", type: "select", options: ["day","week","month","quarter","year","life"] },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "intentions_scope_idx", fields: ["scope"] },
  ],
};
