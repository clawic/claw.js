import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RESUMES: BuiltinCollectionDefinition = {
  name: "resumes",
  displayName: "Resumes",
  family: "career",
  aliases: ["resume","resumes","cv"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "targetRole", type: "text" },
    { name: "updatedOn", type: "date" },
    { name: "file", type: "file" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "resumes_active_idx", fields: ["active"] },
  ],
};
