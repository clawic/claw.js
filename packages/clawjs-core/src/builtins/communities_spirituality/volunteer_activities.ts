import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VOLUNTEER_ACTIVITIES: BuiltinCollectionDefinition = {
  name: "volunteer_activities",
  displayName: "Volunteer Activities",
  family: "communities_spirituality",
  aliases: ["volunteer_activity","volunteer_activities"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "organization", type: "text" },
    { name: "performedAt", type: "date", required: true },
    { name: "hours", type: "number" },
    { name: "location", type: "text" },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "volunteer_activities_performed_idx", fields: ["performedAt"] },
  ],
};
