import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SKILL_ASSESSMENTS: BuiltinCollectionDefinition = {
  name: "skill_assessments",
  displayName: "Skill Assessments",
  family: "career",
  aliases: ["skill_assessment","skill_assessments"],
  fields: [
    { name: "skillId", type: "relation", relation: { collectionName: "skills" } },
    { name: "title", type: "text", required: true },
    { name: "assessedAt", type: "date" },
    { name: "score", type: "number" },
    { name: "maxScore", type: "number" },
    { name: "assessor", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "skill_assessments_skill_idx", fields: ["skillId"] },
  ],
};
