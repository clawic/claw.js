import type { BuiltinCollectionDefinition } from "../_types.ts";

export const STUDY_PLANS: BuiltinCollectionDefinition = {
  name: "study_plans",
  displayName: "Study Plans",
  family: "education_school",
  aliases: ["study_plan","study_plans"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "subjectId", type: "relation", relation: { collectionName: "subjects" } },
    { name: "startDate", type: "date" },
    { name: "endDate", type: "date" },
    { name: "topics", type: "json" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "study_plans_active_idx", fields: ["active"] },
  ],
};
