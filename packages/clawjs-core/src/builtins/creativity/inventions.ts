import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INVENTIONS: BuiltinCollectionDefinition = {
  name: "inventions",
  displayName: "Inventions",
  family: "creativity",
  aliases: ["invention","inventions"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "status", type: "select", options: ["concept","prototype","validated","filed","patented","abandoned"] },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "inventions_status_idx", fields: ["status"] },
  ],
};
