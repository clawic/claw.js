import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SKILLS: BuiltinCollectionDefinition = {
  name: "skills",
  displayName: "Skills",
  family: "learning",
  aliases: ["skill","skills"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "domain", type: "text" },
    { name: "level", type: "select", options: ["novice","beginner","intermediate","advanced","expert"] },
    { name: "description", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "skills_domain_idx", fields: ["domain"] },
  ],
};
