import type { BuiltinCollectionDefinition } from "../_types.ts";

export const READING_CHALLENGES: BuiltinCollectionDefinition = {
  name: "reading_challenges",
  displayName: "Reading Challenges",
  family: "reading_media",
  aliases: ["reading_challenge","reading_challenges"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "source", type: "select", options: ["popsugar","own","reddit","goodreads","other"] },
    { name: "year", type: "number" },
    { name: "targetCount", type: "number" },
    { name: "completedCount", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "reading_challenges_year_idx", fields: ["year"] },
  ],
};
