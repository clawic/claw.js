import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IDEAS: BuiltinCollectionDefinition = {
  name: "ideas",
  displayName: "Ideas",
  family: "creativity",
  aliases: ["idea","ideas"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "domain", type: "text" },
    { name: "status", type: "select", options: ["raw","explored","in_project","discarded"] },
    { name: "score", type: "number" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "ideas_status_idx", fields: ["status"] },
  ],
};
