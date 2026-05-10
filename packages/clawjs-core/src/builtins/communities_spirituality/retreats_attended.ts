import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RETREATS_ATTENDED: BuiltinCollectionDefinition = {
  name: "retreats_attended",
  displayName: "Retreats Attended",
  family: "communities_spirituality",
  aliases: ["retreat_attended","retreats_attended","retreat"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "organization", type: "text" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "location", type: "text" },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "retreats_attended_started_idx", fields: ["startedAt"] },
  ],
};
