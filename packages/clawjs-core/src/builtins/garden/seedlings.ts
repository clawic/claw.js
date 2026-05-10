import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SEEDLINGS: BuiltinCollectionDefinition = {
  name: "seedlings",
  displayName: "Seedlings",
  family: "garden",
  aliases: ["seedling","seedlings"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "species", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "transplantedAt", type: "date" },
    { name: "status", type: "select", options: ["germinating","sprouted","transplanted","failed"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "seedlings_status_idx", fields: ["status"] },
  ],
};
