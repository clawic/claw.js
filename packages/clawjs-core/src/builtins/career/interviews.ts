import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INTERVIEWS: BuiltinCollectionDefinition = {
  name: "interviews",
  displayName: "Interviews",
  family: "career",
  aliases: ["interview","interviews"],
  fields: [
    { name: "jobApplicationId", type: "relation", required: true, relation: { collectionName: "job_applications" } },
    { name: "scheduledAt", type: "date", required: true },
    { name: "kind", type: "select", options: ["phone_screen","technical","behavioral","panel","system_design","onsite","final"] },
    { name: "interviewerName", type: "text" },
    { name: "durationMinutes", type: "number" },
    { name: "outcome", type: "select", options: ["pending","passed","failed","rescheduled"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "interviews_application_idx", fields: ["jobApplicationId"] },
  ],
};
