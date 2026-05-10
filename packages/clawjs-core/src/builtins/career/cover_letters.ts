import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COVER_LETTERS: BuiltinCollectionDefinition = {
  name: "cover_letters",
  displayName: "Cover Letters",
  family: "career",
  aliases: ["cover_letter","cover_letters"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "targetRole", type: "text" },
    { name: "jobApplicationId", type: "relation", relation: { collectionName: "job_applications" } },
    { name: "body", type: "text" },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "cover_letters_name_idx", fields: ["name"] },
  ],
};
