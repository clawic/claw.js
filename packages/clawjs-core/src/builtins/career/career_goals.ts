import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CAREER_GOALS: BuiltinCollectionDefinition = {
  name: "career_goals",
  displayName: "Career Goals",
  family: "career",
  aliases: ["career_goal","career_goals"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "horizon", type: "select", options: ["short","mid","long"] },
    { name: "targetDate", type: "date" },
    { name: "status", type: "select", options: ["planning","active","achieved","abandoned"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "career_goals_status_idx", fields: ["status"] },
  ],
};
