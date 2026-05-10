import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRIAGE_RESPONSIBILITIES: BuiltinCollectionDefinition = {
  name: "triage_responsibilities",
  displayName: "Triage Responsibilities",
  family: "customer_intake",
  aliases: ["triage","triage_responsibility","triage_responsibilities"],
  fields: [
    { name: "teamId", type: "relation", required: true, relation: { collectionName: "teams" } },
    { name: "type", type: "select", required: true, options: ["manual","round_robin"] },
    { name: "currentActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "rotation", type: "json" },
    { name: "externalScheduleUrl", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "triage_team_idx", fields: ["teamId"] },
  ],
};
